"""Acceptance scenarios for profiles, evidence loss, residents and restart."""

from datetime import UTC, datetime

import pytest

from custom_components.hapo.engine import Engine, RoomEngine
from custom_components.hapo.models import (
    default_config,
    default_resident,
    default_room,
    fact,
    validate_config,
)


def source(entity="binary_sensor.motion", active="on"):
    return {"type": "state", "entity_id": entity, "states": [active]}


def states(**values):
    return {"binary_sensor." + key: {"state": value} for key, value in values.items()}


def room(profile="motion", **extra):
    return RoomEngine(
        default_room("office")
        | {"profile": profile, "entry": source(), "off_delay": 10}
        | extra
    )


def tick(engine, now=0, data=None, **values):
    return engine.evaluate(
        data or states(**values),
        {},
        {},
        None,
        now,
        datetime.fromtimestamp(now, UTC),
        300,
    )


@pytest.mark.parametrize("profile", ["motion", "direct", "logic"])
def test_presence_and_retrigger(profile):
    r = room(profile)
    assert tick(r, motion="on")["occupied"] is True
    assert tick(r, 1, motion="off")["occupied"] is True
    assert tick(r, 9, motion="on")["occupied"] is True
    assert tick(r, 10, motion="off")["next_deadline"] == 20
    assert tick(r, 20, motion="off")["occupied"] is False


def test_hybrid_radar_cannot_start_presence():
    r = room("hybrid", hold=source("binary_sensor.radar"), off_delay=0)
    assert tick(r, motion="off", radar="on")["occupied"] is False
    assert tick(r, 1, motion="on", radar="on")["occupied"] is True
    assert tick(r, 2, motion="off", radar="on")["occupied"] is True
    assert tick(r, 3, motion="off", radar="off")["occupied"] is False
    assert tick(r, 4, motion="off", radar="on")["occupied"] is False


def test_bee_immobility_two_doors_and_late_detection():
    r = room(
        "bee",
        doors=[source("binary_sensor.door"), source("binary_sensor.other")],
        close_delay=20,
        open_delay=5,
    )
    assert tick(r, motion="on", door="off", other="off")["latched"] is False
    assert tick(r, 20, motion="on", door="off", other="off")["latched"] is True
    assert tick(r, 2000, motion="off", door="off", other="off")["occupied"] is True
    assert tick(r, 2001, motion="off", door="off", other="on")["latched"] is False
    assert tick(r, 2006, motion="off", door="off", other="on")["occupied"] is False
    tick(r, 2010, motion="off", door="off", other="off")
    assert tick(r, 2200, motion="on", door="off", other="off")["latched"] is True


def test_bee_short_exit_clears_after_stabilization():
    r = room("bee", doors=[source("binary_sensor.door")], close_delay=20, off_delay=0)
    tick(r, motion="on", door="on")
    tick(r, 1, motion="on", door="off")
    tick(r, 8, motion="off", door="off")
    assert tick(r, 21, motion="off", door="off")["occupied"] is False


def test_bee_restart_requires_reconfirmation():
    config = default_room("office") | {
        "profile": "bee",
        "entry": source(),
        "doors": [source("binary_sensor.door")],
        "close_delay": 0,
        "off_delay": 0,
    }
    r = RoomEngine(config)
    assert tick(r, motion="on", door="off")["latched"]
    restored = RoomEngine(config, r.dump())
    value = tick(restored, 10, motion="off", door="off")
    assert value["occupied"] is True and value["degraded"] and not value["latched"]
    restored = RoomEngine(config, restored.dump())
    value = tick(restored, 20, motion="off", door="off")
    assert value["occupied"] is True and value["degraded"]
    assert tick(restored, 310, motion="off", door="off")["occupied"] is None
    assert tick(restored, 311, motion="on", door="off")["latched"]


def test_unknown_is_never_clear_including_not():
    r = room(entry={"type": "not", "condition": source()}, off_delay=0)
    assert tick(r, motion="off")["occupied"] is True
    assert tick(r, 1, motion="unavailable")["degraded"]
    assert tick(r, 301, motion="unavailable")["occupied"] is None


def test_available_positive_source_survives_missing_peer():
    r = room(
        entry={"type": "or", "conditions": [source(), source("binary_sensor.other")]}
    )
    assert tick(r, motion="on", other="unavailable")["occupied"] is True
    assert not tick(r, 1, motion="on", other="unavailable")["degraded"]


def test_door_anticipation_only_real_open_transition():
    r = room(
        doors=[source("binary_sensor.door")],
        anticipate=True,
        off_delay=0,
        open_delay=10,
    )
    assert tick(r, motion="off", door="on")["occupied"] is False
    tick(r, 1, motion="off", door="off")
    assert tick(r, 2, motion="off", door="on")["occupied"] is True
    assert tick(r, 12, motion="off", door="on")["occupied"] is False


def test_override_expires_and_respects_sources():
    r = room(off_delay=0)
    r.override = {"occupied": False, "until": 10}
    assert tick(r, motion="on")["occupied"] is False
    assert tick(r, 10, motion="on")["occupied"] is True


def house():
    c = default_config()
    for key in ("a", "b"):
        c["residents"][key] = default_resident(key) | {
            "entity_id": "person." + key,
            "presence_delay": 20,
        }
    return Engine(c)


def htick(e, now=0, a="home", b="home"):
    return e.evaluate(
        {"person.a": {"state": a}, "person.b": {"state": b}},
        now,
        datetime.fromtimestamp(now, UTC),
    )


def test_four_home_modes_sleep_and_named_zones():
    e = house()
    assert htick(e)["home"]["mode"] is None
    assert htick(e, 20)["home"]["mode"] == "active"
    e.sleep_overrides["a"] = True
    assert htick(e, 21)["home"]["mode"] == "quiet"
    e.sleep_overrides["b"] = True
    assert htick(e, 22)["home"]["mode"] == "sleeping"
    htick(e, 30, a="Work", b="school")
    result = htick(e, 50, a="Work", b="school")
    assert result["home"]["mode"] == "away"
    assert e.sleep_overrides == {}


def test_residents_authoritative_and_guests_explicit():
    e = house()
    htick(e, a="not_home", b="not_home")
    assert htick(e, 20, a="not_home", b="not_home")["home"]["occupied"] is False
    e.guests = True
    result = htick(e, 21, a="not_home", b="not_home")
    assert result["home"]["occupied"] is True
    assert result["home"]["mode"] == "active"
    assert result["home"]["counts_known"] is False


def test_no_residents_is_unknown_not_empty():
    e = Engine(default_config())
    assert htick(e)["home"]["occupied"] is None


def test_contextual_sole_awake_exclusion_and_guests():
    c = default_config()
    c["residents"]["a"] = default_resident("a") | {
        "entity_id": "person.a",
        "presence_delay": 0,
    }
    c["rooms"]["office"] = default_room("office") | {
        "entry": source("binary_sensor.office"),
        "off_delay": 0,
    }
    exclude = {
        "type": "and",
        "conditions": [
            fact("counts_known", True),
            fact("awake_count", 1),
            {"type": "room", "room_id": "office", "occupied": True},
        ],
    }
    c["rooms"]["living"] = default_room("living") | {
        "profile": "contextual",
        "entry": source(),
        "release": exclude,
        "off_delay": 0,
    }
    e = Engine(validate_config(c))
    data = states(motion="on", office="off") | {"person.a": {"state": "home"}}
    assert e.evaluate(data, 0, datetime.now(UTC))["rooms"]["living"]["occupied"]
    data.update(states(motion="off", office="on"))
    assert (
        e.evaluate(data, 1, datetime.now(UTC))["rooms"]["living"]["occupied"] is False
    )
    e.guests = True
    data.update(states(motion="on"))
    assert e.evaluate(data, 2, datetime.now(UTC))["rooms"]["living"]["occupied"] is True


def test_cycles_rejected_with_house_room_source():
    c = default_config()
    c["rooms"]["office"] = default_room("office") | {
        "entry": source(),
        "gate": fact("occupied", True),
    }
    c["home"].update(source="rooms", rooms=["office"])
    with pytest.raises(ValueError, match="circular_dependency"):
        validate_config(c)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -1, 604801, True, "20"])
def test_invalid_durations(bad):
    c = default_config()
    c["failure_grace"] = bad
    with pytest.raises(ValueError):
        validate_config(c)


def test_restart_resumes_absence_deadline_and_override():
    original = room(off_delay=60)
    tick(original, motion="on")
    assert tick(original, 10, motion="off")["next_deadline"] == 70
    restored = RoomEngine(original.config, original.dump())
    assert tick(restored, 40, motion="off")["next_deadline"] == 70
    assert tick(restored, 70, motion="off")["occupied"] is False
    original.override = {"occupied": True, "until": 100}
    restored = RoomEngine(original.config, original.dump())
    assert tick(restored, 90, motion="off")["occupied"] is True
    assert tick(restored, 100, motion="on")["override"] is None


def test_bee_unknown_door_invalidates_latch_and_open_option_is_explicit():
    r = room(
        "bee",
        doors=[source("binary_sensor.door")],
        close_delay=0,
        off_delay=0,
        open_delay=0,
    )
    assert tick(r, motion="on", door="off")["latched"]
    assert tick(r, 1, motion="off", door="unavailable")["degraded"]
    assert not tick(r, 2, motion="off", door="unavailable")["latched"]
    assert tick(r, 301, motion="off", door="unavailable")["occupied"] is None
    assert tick(r, 302, motion="off", door="on")["occupied"] is False
    r.config["keep_open"] = True
    assert tick(r, 303, motion="off", door="on")["occupied"] is True


def test_bee_optional_latch_limit():
    r = room(
        "bee",
        doors=[source("binary_sensor.door")],
        close_delay=0,
        off_delay=0,
        latch_max=100,
    )
    tick(r, motion="on", door="off")
    assert tick(r, 99, motion="off", door="off")["occupied"] is True
    assert tick(r, 100, motion="off", door="off")["occupied"] is False


def test_numeric_hysteresis_attributes_and_invalid_numeric_values():
    r = room(
        "direct",
        off_delay=0,
        entry={
            "type": "numeric",
            "entity_id": "sensor.desk",
            "attribute": "power",
            "above": 10,
            "hysteresis": 2,
        },
    )

    def data(power):
        return {"sensor.desk": {"state": "on", "attributes": {"power": power}}}

    assert tick(r, data=data(9))["occupied"] is False
    assert tick(r, 1, data=data(11))["occupied"] is True
    assert tick(r, 2, data=data(9))["occupied"] is True
    assert tick(r, 3, data=data(8))["occupied"] is False
    assert tick(r, 4, data=data(float("nan")))["degraded"]
    assert tick(r, 304, data=data(float("nan")))["occupied"] is None


def test_continuous_condition_cancels_when_source_disappears():
    r = room(off_delay=0, entry=source() | {"for": 10})
    assert tick(r, motion="on")["occupied"] is False
    assert tick(r, 9, motion="unavailable")["degraded"]
    assert tick(r, 10, motion="on")["next_deadline"] == 20
    assert tick(r, 20, motion="on")["occupied"] is True


def test_automatic_sleep_unknown_manual_priority_and_departure_reset():
    c = default_config()
    c["residents"]["a"] = default_resident("a") | {
        "entity_id": "person.a",
        "presence_delay": 0,
        "sleep_source": source("binary_sensor.bed"),
    }
    e = Engine(c)

    def run(now, person="home", bed="on"):
        return e.evaluate(
            {"person.a": {"state": person}, **states(bed=bed)},
            now,
            datetime.now(UTC),
        )

    assert run(0)["home"]["mode"] == "sleeping"
    assert run(1, bed="unavailable")["residents"]["a"]["sleep_degraded"]
    assert run(301, bed="unavailable")["residents"]["a"]["sleeping"] is None
    e.sleep_overrides["a"] = False
    assert run(302)["residents"]["a"]["sleeping"] is False
    run(303, person="Office")
    assert e.sleep_overrides == {}
    assert run(304, person="Office")["residents"]["a"]["sleeping"] is False


def test_mode_priority_rename_and_override_do_not_change_facts():
    e = house()
    e.config["home"]["modes"].insert(
        0, {"id": "movie", "name": "Cinéma", "condition": source("binary_sensor.movie")}
    )
    data = {
        "person.a": {"state": "home"},
        "person.b": {"state": "home"},
        **states(movie="on"),
    }
    e.evaluate(data, 0, datetime.now(UTC))
    result = e.evaluate(data, 20, datetime.now(UTC))
    assert result["home"]["mode"] == "movie"
    e.config["home"]["modes"][0]["name"] = "Film"
    assert e.evaluate(data, 21, datetime.now(UTC))["home"]["mode"] == "movie"
    e.home_override = {"mode": "away", "until": 30}
    result = e.evaluate(data, 22, datetime.now(UTC))
    assert result["home"]["mode"] == "away" and result["home"]["occupied"] is True
    assert e.evaluate(data, 30, datetime.now(UTC))["home"]["mode"] == "movie"


def test_external_home_source_does_not_invent_person_counts():
    c = default_config()
    c["home"].update(source="entity", entity=source())
    e = Engine(validate_config(c))
    result = e.evaluate(states(motion="on"), 0, datetime.now(UTC))
    assert result["home"]["mode"] == "active"
    assert result["home"]["present_count"] is None
    assert result["home"]["counts_known"] is False


@pytest.mark.parametrize("kind", ["room", "mode"])
def test_room_and_mode_cycles_are_rejected(kind):
    c = default_config()
    c["rooms"]["office"] = default_room("office") | {"entry": source()}
    if kind == "room":
        c["rooms"]["office"]["gate"] = {
            "type": "room",
            "room_id": "office",
            "occupied": True,
        }
    else:
        c["rooms"]["office"]["gate"] = {"type": "home_mode", "mode_id": "active"}
        c["home"]["modes"][-1]["condition"] = {
            "type": "room",
            "room_id": "office",
            "occupied": True,
        }
    with pytest.raises(ValueError, match="circular_dependency"):
        validate_config(c)


def test_bee_does_not_latch_an_unconfirmed_short_motion():
    r = room(
        "bee",
        doors=[source("binary_sensor.door")],
        close_delay=0,
        on_delay=5,
        off_delay=0,
    )
    assert tick(r, motion="off", door="off")["occupied"] is False
    assert not tick(r, 1, motion="on", door="off")["latched"]
    assert not tick(r, 2, motion="off", door="off")["latched"]
    assert tick(r, 6, motion="off", door="off")["occupied"] is False
    tick(r, 7, motion="on", door="off")
    assert tick(r, 12, motion="on", door="off")["latched"]
    assert tick(r, 1000, motion="off", door="off")["occupied"] is True


def test_guests_without_residents_and_uncertain_residents():
    e = Engine(default_config())
    e.guests = True
    assert htick(e)["home"]["mode"] == "active"
    e = house()
    e.guests = True
    result = htick(e, a="unavailable", b="unavailable")
    assert result["home"]["occupied"] is True
    assert result["home"]["mode"] is None


def test_opening_anticipation_has_no_duplicate_absence_delay():
    r = room(
        doors=[source("binary_sensor.door")],
        anticipate=True,
        off_delay=10,
        open_delay=10,
    )
    tick(r, motion="off", door="off")
    assert tick(r, 1, motion="off", door="on")["occupied"] is True
    assert tick(r, 11, motion="off", door="on")["occupied"] is False


def test_lost_door_continuity_requires_reconfirmation_when_closed_again():
    r = room("bee", doors=[source("binary_sensor.door")], close_delay=0, off_delay=0)
    tick(r, motion="on", door="off")
    tick(r, 1, motion="off", door="unavailable")
    result = tick(r, 2, motion="off", door="off")
    assert result["occupied"] is True and result["degraded"]
    assert tick(r, 301, motion="off", door="off")["occupied"] is None
