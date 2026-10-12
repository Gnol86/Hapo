"""Explain compatible profiles from metadata; never apply suggestions."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN


def catalog(hass: HomeAssistant) -> dict:
    areas, devices, entities = (
        ar.async_get(hass),
        dr.async_get(hass),
        er.async_get(hass),
    )
    result = []
    for state in hass.states.async_all():
        entry = entities.async_get(state.entity_id)
        if entry and (entry.platform == DOMAIN or entry.disabled_by):
            continue
        if state.domain not in (
            "binary_sensor",
            "sensor",
            "person",
            "device_tracker",
            "input_boolean",
            "input_number",
            "input_select",
            "switch",
            "media_player",
            "schedule",
            "light",
        ):
            continue
        device = (
            devices.async_get(entry.device_id) if entry and entry.device_id else None
        )
        area = (entry.area_id if entry else None) or (
            device.area_id if device else None
        )
        result.append(
            {
                "entity_id": state.entity_id,
                "name": state.name,
                "state": state.state,
                "area_id": area,
                "device_class": state.attributes.get("device_class"),
                "unit": state.attributes.get("unit_of_measurement"),
                "device_id": entry.device_id if entry else None,
                "attributes": {
                    key: value
                    for key, value in state.attributes.items()
                    if isinstance(value, (str, int, float, bool))
                    and key
                    not in ("latitude", "longitude", "gps_accuracy", "access_token")
                },
                "members": state.attributes.get("entity_id", []),
            }
        )
    return {
        "areas": [{"area_id": a.id, "name": a.name} for a in areas.async_list_areas()],
        "entities": sorted(result, key=lambda item: item["name"].casefold()),
    }


def suggestions(entities: list[dict], area_id: str | None) -> list[dict]:
    local = [entity for entity in entities if area_id and entity["area_id"] == area_id]
    motion = [e["entity_id"] for e in local if e["device_class"] == "motion"]
    continuous = [
        e["entity_id"] for e in local if e["device_class"] in ("occupancy", "presence")
    ]
    doors = [
        e["entity_id"]
        for e in local
        if e["device_class"] in ("door", "opening", "garage_door")
    ]
    result = []
    if motion and continuous:
        result.append(
            {
                "profile": "hybrid",
                "reason": "motion_and_occupancy",
                "entry": motion,
                "hold": continuous,
                "doors": [],
            }
        )
    if motion and doors:
        result.append(
            {
                "profile": "bee",
                "reason": "motion_and_doors",
                "entry": motion,
                "hold": [],
                "doors": doors,
            }
        )
    if continuous:
        result.append(
            {
                "profile": "direct",
                "reason": "occupancy_available",
                "entry": continuous,
                "hold": [],
                "doors": [],
            }
        )
    if motion:
        result.append(
            {
                "profile": "motion",
                "reason": "motion_available",
                "entry": motion,
                "hold": [],
                "doors": [],
            }
        )
    result.extend(
        {
            "profile": profile,
            "reason": "manual_sources",
            "entry": [],
            "hold": [],
            "doors": [],
        }
        for profile in ("logic", "contextual")
    )
    return result
