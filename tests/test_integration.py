"""Real HA entities, services, saved configuration and authenticated API."""

import pytest
from homeassistant.core import CoreState
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hapo.models import default_config, default_resident, default_room


@pytest.fixture
async def integration(hass):
    hass.set_state(CoreState.running)
    entry = MockConfigEntry(domain="hapo", unique_id="hapo", title="Hapo", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    yield entry
    if entry.runtime_data and not entry.runtime_data.stopped:
        await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def configure(hass, entry):
    c = default_config()
    c["rooms"]["office"] = default_room("office") | {
        "entry": {
            "type": "state",
            "entity_id": "binary_sensor.motion",
            "states": ["on"],
        },
        "off_delay": 0,
    }
    c["residents"]["alice"] = default_resident("alice") | {
        "entity_id": "person.alice",
        "presence_delay": 0,
    }
    hass.states.async_set("binary_sensor.motion", "on")
    hass.states.async_set("person.alice", "home")
    await entry.runtime_data.async_save(c, 0)
    await hass.async_block_till_done()


async def test_entities_commands_and_reload(hass, integration):
    await configure(hass, integration)
    assert hass.states.get("binary_sensor.hapo_office_presence").state == "on"

    assert hass.states.get("sensor.hapo_home_mode").state == "active"
    await hass.services.async_call(
        "hapo", "sleep", {"target_id": "alice", "value": "sleeping"}, blocking=True
    )
    assert hass.states.get("sensor.hapo_home_mode").state == "sleeping"
    await hass.services.async_call(
        "hapo",
        "room_override",
        {"target_id": "office", "value": "clear"},
        blocking=True,
    )
    assert hass.states.get("binary_sensor.hapo_office_presence").state == "off"
    await hass.config_entries.async_reload(integration.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.hapo_office_presence").state == "off"
    await hass.services.async_call(
        "button", "press", {"entity_id": "button.hapo_office_resume"}, blocking=True
    )
    assert hass.states.get("binary_sensor.hapo_office_presence").state == "on"


async def test_startup_source_events_do_not_reset_persisted_absence_deadline(
    hass, integration
):
    await configure(hass, integration)
    manager = integration.runtime_data
    from copy import deepcopy

    config = deepcopy(manager.config)
    config["rooms"]["office"]["off_delay"] = 60
    await manager.async_save(config, manager.revision)
    hass.states.async_set("binary_sensor.motion", "off")
    await hass.async_block_till_done()
    since = manager.engine.rooms["office"].stable.candidate_since
    assert since is not None
    hass.set_state(CoreState.starting)
    await hass.config_entries.async_reload(integration.entry_id)
    await hass.async_block_till_done()
    manager = integration.runtime_data
    hass.states.async_set("binary_sensor.motion", "unavailable")
    await hass.async_block_till_done()
    hass.states.async_set("binary_sensor.motion", "off")
    await hass.async_block_till_done()
    assert not manager.ready
    assert manager.engine.rooms["office"].stable.candidate_since == since
    hass.set_state(CoreState.running)
    hass.bus.async_fire("homeassistant_started")
    await hass.async_block_till_done()
    assert manager.ready
    assert manager.engine.snapshot["rooms"]["office"]["occupied"] is True
    assert manager.engine.rooms["office"].stable.deadline == since + 60


async def test_api_revision_conflict(hass, integration, hass_ws_client):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "hapo/get"})
    result = await client.receive_json()
    assert result["success"]
    config = result["result"]["config"]
    for expected in (True, False):
        await client.send_json_auto_id(
            {"type": "hapo/save", "config": config, "revision": 0}
        )
        assert (await client.receive_json())["success"] is expected
    await client.close()


async def test_removed_room_entity_is_removed(hass, integration):
    await configure(hass, integration)
    c = default_config()
    await integration.runtime_data.async_save(c, 1)
    await hass.async_block_till_done()
    assert not er.async_get(hass).async_get("binary_sensor.hapo_office_presence")
    from homeassistant.helpers import device_registry as dr

    assert not dr.async_get(hass).async_get_device_by_identifier(
        ("hapo", "room_office"), integration.entry_id
    )


async def test_rename_preserves_bee_continuity_and_identifiers(hass, integration):
    await configure(hass, integration)
    manager = integration.runtime_data
    from copy import deepcopy

    c = deepcopy(manager.config)
    c["rooms"]["office"].update(
        profile="bee",
        doors=[{"type": "state", "entity_id": "binary_sensor.door", "states": ["on"]}],
        close_delay=0,
    )
    hass.states.async_set("binary_sensor.door", "off")
    await manager.async_save(c, 1)
    hass.states.async_set("binary_sensor.motion", "off")
    await hass.async_block_till_done()
    assert manager.engine.snapshot["rooms"]["office"]["latched"]
    c["rooms"]["office"]["name"] = "Personal office"
    await manager.async_save(c, 2)
    await hass.async_block_till_done()
    assert manager.engine.snapshot["rooms"]["office"]["latched"]
    assert hass.states.get("binary_sensor.hapo_office_presence").state == "on"


async def test_external_mode_condition_is_subscribed(hass, integration):
    await configure(hass, integration)
    from copy import deepcopy

    c = deepcopy(integration.runtime_data.config)
    c["home"]["modes"].insert(
        0,
        {
            "id": "cinema",
            "name": "Cinema",
            "condition": {
                "type": "state",
                "entity_id": "media_player.tv",
                "states": ["playing"],
            },
        },
    )
    hass.states.async_set("media_player.tv", "off")
    await integration.runtime_data.async_save(c, 1)
    hass.states.async_set("media_player.tv", "playing")
    await hass.async_block_till_done()
    assert hass.states.get("sensor.hapo_home_mode").state == "cinema"


async def test_permissions_and_redacted_diagnostics(
    hass, integration, hass_ws_client, hass_read_only_access_token
):
    await configure(hass, integration)
    import json

    from custom_components.hapo.diagnostics import async_get_config_entry_diagnostics

    data = json.dumps(await async_get_config_entry_diagnostics(hass, integration))
    assert "office" not in data and "alice" not in data and "binary_sensor" not in data
    client = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    await client.send_json_auto_id({"type": "hapo/get"})
    response = (await client.receive_json())["result"]
    assert "config" not in response and "catalog" not in response
    await client.send_json_auto_id(
        {"type": "hapo/command", "command": "guests", "value": True}
    )
    assert not (await client.receive_json())["success"]
    assert integration.runtime_data.engine.guests is False
    await client.send_json_auto_id(
        {"type": "hapo/save", "config": default_config(), "revision": 1}
    )
    assert not (await client.receive_json())["success"]
    await client.close()


async def test_native_activity_has_entity_and_causal_context(hass, integration):
    await configure(hass, integration)
    events = []
    remove = hass.bus.async_listen("hapo_decision", events.append)
    duplicates = []
    remove_duplicates = hass.bus.async_listen("logbook_entry", duplicates.append)
    from homeassistant.core import Context

    cause = Context()
    hass.states.async_set("binary_sensor.motion", "off", context=cause)
    await hass.async_block_till_done()
    remove()
    remove_duplicates()
    assert not duplicates
    assert any(
        e.data.get("entity_id") == "binary_sensor.hapo_office_presence"
        and e.context.parent_id == cause.id
        and "absence" in e.data["message"]
        for e in events
    )
    from types import SimpleNamespace

    from custom_components.hapo.logbook import async_describe_events

    descriptions = {}
    async_describe_events(
        hass, lambda domain, kind, describe: descriptions.update({kind: describe})
    )
    event = next(
        e
        for e in events
        if e.data.get("entity_id") == "binary_sensor.hapo_office_presence"
    )
    described = descriptions["hapo_decision"](
        SimpleNamespace(data=event.data, context_id=event.context.id)
    )
    assert described["entity_id"] == "binary_sensor.hapo_office_presence"
    assert described["context_id"] == event.context.id


async def test_single_instance_config_flow(hass, integration):
    result = await hass.config_entries.flow.async_init(
        "hapo", context={"source": "user"}
    )
    assert result["type"] == "abort" and result["reason"] == "single_instance_allowed"


async def test_sleep_toggle_and_validation_are_public_and_non_mutating(
    hass, integration, hass_ws_client
):
    await configure(hass, integration)
    for state in ["on", "off"]:
        await hass.services.async_call(
            "hapo", "sleep", {"target_id": "alice", "value": "toggle"}, blocking=True
        )
        assert hass.states.get("binary_sensor.hapo_alice_sleeping").state == state
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "hapo/validate", "config": default_config()}
    )
    assert (await client.receive_json())["success"]
    assert integration.runtime_data.revision == 1
    assert "office" in integration.runtime_data.config["rooms"]
    await client.close()


async def test_source_events_during_save_do_not_restore_a_released_bee_latch(
    hass, integration, monkeypatch
):
    from copy import deepcopy

    await configure(hass, integration)
    manager = integration.runtime_data
    c = deepcopy(manager.config)
    c["rooms"]["office"].update(
        profile="bee",
        doors=[{"type": "state", "entity_id": "binary_sensor.door", "states": ["on"]}],
        close_delay=0,
    )
    hass.states.async_set("binary_sensor.door", "off")
    await manager.async_save(c, 1)
    hass.states.async_set("binary_sensor.motion", "off")
    await hass.async_block_till_done()
    assert manager.engine.snapshot["rooms"]["office"]["latched"]
    original = manager.store.async_save

    async def concurrent_write(data):
        hass.states.async_set("binary_sensor.door", "on")
        await hass.async_block_till_done()
        hass.states.async_set("binary_sensor.door", "off")
        await hass.async_block_till_done()
        await original(data)

    monkeypatch.setattr(manager.store, "async_save", concurrent_write)
    c["rooms"]["office"]["name"] = "Renamed"
    await manager.async_save(c, 2)
    assert not manager.engine.snapshot["rooms"]["office"]["latched"]
    monkeypatch.setattr(manager.store, "async_save", original)
