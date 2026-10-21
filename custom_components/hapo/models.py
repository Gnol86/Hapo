"""Versioned configuration, validation and explicit dependency ordering."""

import re
from copy import deepcopy
from math import isfinite

from .const import FACTS, PROFILES

RESERVED = {"unknown", "unavailable", "auto", "facts", "mode"}


def default_room(room_id: str, area_id: str | None = None) -> dict:
    """New rooms do nothing until a profile and sources have been saved."""
    return {
        "id": room_id,
        "name": "",
        "area_id": area_id,
        "enabled": True,
        "profile": "motion",
        "entry": None,
        "hold": None,
        "gate": None,
        "release": None,
        "doors": [],
        "on_delay": 0,
        "off_delay": 60,
        "open_delay": 60,
        "close_delay": 20,
        "require_opening": False,
        "recovery_delay": 120,
        "anticipate": False,
        "keep_open": False,
        "latch_max": 0,
    }


def default_resident(resident_id: str) -> dict:
    return {
        "id": resident_id,
        "name": "",
        "entity_id": "",
        "home_states": ["home"],
        "presence_delay": 20,
        "sleep_source": None,
    }


def fact(key: str, value: object, op: str = "eq") -> dict:
    return {"type": "fact", "key": key, "op": op, "value": value}


def default_config() -> dict:
    return {
        "version": 1,
        "failure_grace": 300,
        "rooms": {},
        "residents": {},
        "home": {
            "source": "residents",
            "entity": None,
            "rooms": [],
            "modes": [
                {"id": "away", "name": "", "condition": fact("occupied", False)},
                {"id": "sleeping", "name": "", "condition": fact("all_sleeping", True)},
                {
                    "id": "quiet",
                    "name": "",
                    "condition": {
                        "type": "and",
                        "conditions": [
                            fact("any_sleeping", True),
                            fact("sleeping_count", 0, "gt"),
                            fact("awake_count", 0, "gt"),
                        ],
                    },
                },
                {
                    "id": "active",
                    "name": "",
                    "condition": {
                        "type": "and",
                        "conditions": [
                            fact("occupied", True),
                            fact("any_sleeping", False),
                        ],
                    },
                },
            ],
        },
    }


def duration(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("invalid_duration")
    if not isfinite(value) or not 0 <= value <= 604800:
        raise ValueError("invalid_duration")
    return float(value)


def identifier(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"[a-z0-9][a-z0-9_-]{0,63}", value
    ):
        raise ValueError("invalid_identifier")
    if value in RESERVED:
        raise ValueError("reserved_identifier")
    return value


def entity_id(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[a-z_]+\.[a-z0-9_]+", value):
        raise ValueError("invalid_entity")
    # Internal dependencies must use typed room/fact/mode conditions so the
    # dependency graph can detect cycles even before entities exist.
    if value.split(".", 1)[1].startswith("hapo_"):
        raise ValueError("use_internal_reference")
    return value


def condition_dependencies(node: dict | None) -> set[str]:
    if not node:
        return set()
    result = set()
    if node["type"] == "room":
        result.add("room:" + node["room_id"])
    elif node["type"] == "fact":
        result.add("facts")
    elif node["type"] == "home_mode":
        result.add("mode")
    for child in node.get("conditions", []):
        result.update(condition_dependencies(child))
    result.update(condition_dependencies(node.get("condition")))
    return result


def condition_entities(node: dict | None) -> set[str]:
    if not node:
        return set()
    result = {node["entity_id"]} if node.get("entity_id") else set()
    for child in node.get("conditions", []):
        result.update(condition_entities(child))
    return result | condition_entities(node.get("condition"))


def validate_condition(node: object, depth: int = 0) -> None:
    if node is None:
        return
    if not isinstance(node, dict) or depth > 8:
        raise ValueError("invalid_condition")
    duration(node.get("for", 0))
    kind = node.get("type")
    if kind in ("and", "or"):
        children = node.get("conditions")
        if not isinstance(children, list) or not 1 <= len(children) <= 32:
            raise ValueError("invalid_condition_group")
        for child in children:
            if child is None:
                raise ValueError("invalid_condition")
            validate_condition(child, depth + 1)
    elif kind == "not":
        if not node.get("condition"):
            raise ValueError("invalid_condition")
        validate_condition(node["condition"], depth + 1)
    elif kind in ("state", "numeric"):
        entity_id(node.get("entity_id"))
        if "attribute" in node and not isinstance(node["attribute"], str):
            raise ValueError("invalid_attribute")
        if kind == "state":
            states = node.get("states")
            if (
                not isinstance(states, list)
                or not states
                or any(
                    not isinstance(s, str) or s in ("unknown", "unavailable")
                    for s in states
                )
            ):
                raise ValueError("invalid_states")
        else:
            values = [node.get("above"), node.get("below")]
            if all(v is None for v in values):
                raise ValueError("missing_threshold")
            for value in values:
                if value is not None and (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not isfinite(value)
                ):
                    raise ValueError("invalid_threshold")
            if all(v is not None for v in values) and values[0] >= values[1]:
                raise ValueError("invalid_range")
            hysteresis = node.get("hysteresis", 0)
            if (
                isinstance(hysteresis, bool)
                or not isinstance(hysteresis, (int, float))
                or not isfinite(hysteresis)
                or hysteresis < 0
            ):
                raise ValueError("invalid_hysteresis")
    elif kind == "room":
        identifier(node.get("room_id"))
        if not isinstance(node.get("occupied"), bool):
            raise ValueError("invalid_condition")
    elif kind == "home_mode":
        identifier(node.get("mode_id"))
    elif kind == "fact":
        if node.get("key") not in FACTS or node.get("op", "eq") not in (
            "eq",
            "ne",
            "gt",
            "gte",
            "lt",
            "lte",
        ):
            raise ValueError("invalid_fact")
        if not isinstance(node.get("value"), (bool, int, float)) or not isfinite(
            node["value"]
        ):
            raise ValueError("invalid_fact")
    elif kind == "time":
        from datetime import time

        try:
            time.fromisoformat(node["after"])
            time.fromisoformat(node["before"])
        except (KeyError, ValueError, TypeError) as err:
            raise ValueError("invalid_time") from err
    else:
        raise ValueError("invalid_condition_type")


def dependency_order(config: dict) -> list[str]:
    graph = {"facts": set(), "mode": {"facts"}}
    home = config["home"]
    if home["source"] == "rooms":
        graph["facts"].update("room:" + r for r in home["rooms"])
    for mode in home["modes"]:
        graph["mode"].update(condition_dependencies(mode["condition"]))
    for key, room in config["rooms"].items():
        graph["room:" + key] = set().union(
            *(
                condition_dependencies(room[field])
                for field in ("entry", "hold", "gate", "release")
            ),
            *(condition_dependencies(node) for node in room["doors"]),
        )
    visited, active, order = set(), set(), []

    def visit(key: str) -> None:
        if key not in graph:
            raise ValueError("missing_room")
        if key in active:
            raise ValueError("circular_dependency")
        if key in visited:
            return
        active.add(key)
        for other in sorted(graph[key]):
            visit(other)
        active.remove(key)
        visited.add(key)
        order.append(key)

    for key in graph:
        visit(key)
    return order


def validate_config(value: object) -> dict:
    if not isinstance(value, dict) or value.get("version") != 1:
        raise ValueError("unsupported_version")
    config = deepcopy(value)
    duration(config.get("failure_grace"))
    for collection in ("rooms", "residents"):
        if (
            not isinstance(config.get(collection), dict)
            or len(config[collection]) > 200
        ):
            raise ValueError("invalid_collection")
        for key, item in config[collection].items():
            identifier(key)
            if not isinstance(item, dict) or item.get("id") != key:
                raise ValueError("invalid_identifier")
            if not isinstance(item.get("name"), str) or len(item["name"]) > 100:
                raise ValueError("invalid_name")
    for key, room in config["rooms"].items():
        room = config["rooms"][key] = default_room(key) | room
        if room["profile"] not in PROFILES:
            raise ValueError("invalid_profile")
        for field in ("enabled", "anticipate", "keep_open", "require_opening"):
            if not isinstance(room[field], bool):
                raise ValueError("invalid_boolean")
        if room["area_id"] is not None and not isinstance(room["area_id"], str):
            raise ValueError("invalid_area")
        for field in (
            "on_delay",
            "off_delay",
            "open_delay",
            "close_delay",
            "recovery_delay",
            "latch_max",
        ):
            duration(room[field])
        for field in ("entry", "hold", "gate", "release"):
            validate_condition(room[field])
        if not isinstance(room["doors"], list) or len(room["doors"]) > 32:
            raise ValueError("invalid_doors")
        for door in room["doors"]:
            validate_condition(door)
            if not door or door["type"] != "state":
                raise ValueError("invalid_door")
        if room["enabled"] and room["entry"] is None:
            raise ValueError("missing_entry")
        if room["profile"] == "bee" and not room["doors"]:
            raise ValueError("missing_doors")
    for key, resident in config["residents"].items():
        resident = config["residents"][key] = default_resident(key) | resident
        entity_id(resident["entity_id"])
        states = resident["home_states"]
        if (
            not isinstance(states, list)
            or not states
            or any(
                not isinstance(s, str) or s in ("unknown", "unavailable")
                for s in states
            )
        ):
            raise ValueError("invalid_states")
        duration(resident["presence_delay"])
        validate_condition(resident["sleep_source"])
        if condition_dependencies(resident["sleep_source"]):
            raise ValueError("sleep_source_must_be_external")
    home = config.get("home")
    if not isinstance(home, dict) or home.get("source") not in (
        "residents",
        "entity",
        "rooms",
    ):
        raise ValueError("invalid_home_source")
    validate_condition(home.get("entity"))
    if condition_dependencies(home.get("entity")):
        raise ValueError("home_source_must_be_external")
    if home["source"] == "entity" and home.get("entity") is None:
        raise ValueError("missing_home_source")
    if not isinstance(home.get("rooms"), list) or any(
        not isinstance(r, str) or r not in config["rooms"] for r in home["rooms"]
    ):
        raise ValueError("missing_room")
    if home["source"] == "rooms" and not home["rooms"]:
        raise ValueError("missing_room")
    modes = home.get("modes")
    if not isinstance(modes, list) or not 1 <= len(modes) <= 32:
        raise ValueError("invalid_modes")
    ids = set()
    for mode in modes:
        if not isinstance(mode, dict):
            raise ValueError("invalid_modes")
        identifier(mode.get("id"))
        if mode["id"] in ids:
            raise ValueError("duplicate_mode")
        ids.add(mode["id"])
        if not isinstance(mode.get("name"), str) or len(mode["name"]) > 100:
            raise ValueError("invalid_name")
        if mode.get("condition") is None:
            raise ValueError("missing_condition")
        validate_condition(mode["condition"])

    def check_modes(node: dict | None) -> None:
        if not node:
            return
        if node["type"] == "home_mode" and node["mode_id"] not in ids:
            raise ValueError("missing_mode")
        for child in node.get("conditions", []):
            check_modes(child)
        check_modes(node.get("condition"))

    for room in config["rooms"].values():
        for field in ("entry", "hold", "gate", "release"):
            check_modes(room[field])
    dependency_order(config)
    return config
