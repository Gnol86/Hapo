"""Home Assistant adapter: listeners, persistence, permissions and commands."""

import asyncio
from copy import deepcopy
from typing import Any

from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    async_track_point_in_utc_time,
    async_track_state_change_event,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .activity import record
from .const import DOMAIN, SIGNAL_UPDATED
from .discovery import catalog, suggestions
from .engine import Engine
from .models import condition_entities, default_config, duration, validate_config


class HapoError(HomeAssistantError):
    """An error code shared with the translated panel."""


class HapoManager:
    def __init__(self, hass: HomeAssistant, entry) -> None:
        self.hass, self.entry = hass, entry
        self.config = default_config()
        self.engine = Engine(self.config)
        self.revision = 0
        self.store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}", atomic_writes=True)
        self.listeners = set()
        self.removers = []
        self.unlisten = self.timer = None
        self.lock = asyncio.Lock()
        self.stopped = False
        self.loaded = False
        self.context = Context()
        self._last_store = None

    async def async_load(self) -> None:
        saved = await self.store.async_load()
        if saved:
            self.config = validate_config(saved["config"])
            self.revision = saved.get("revision", 0)
            self.engine = Engine(self.config, saved.get("runtime"))
        self._subscribe()
        self.removers.append(
            self.hass.bus.async_listen(
                ar.EVENT_AREA_REGISTRY_UPDATED, self._registry_changed
            )
        )
        self.removers.append(
            self.hass.bus.async_listen(
                er.EVENT_ENTITY_REGISTRY_UPDATED, self._registry_changed
            )
        )
        if not self.hass.is_running:
            self.removers.append(
                self.hass.bus.async_listen_once(
                    EVENT_HOMEASSISTANT_STARTED, self._changed
                )
            )
        self.loaded = True
        # Source integrations may load after Hapo. Do not cancel restored
        # deadlines merely because their entities do not exist yet at startup.
        if self.hass.is_running:
            self.recompute()

    @callback
    def _registry_changed(self, event) -> None:
        self.notify()

    def sources(self) -> set[str]:
        result = set()
        for room in self.config["rooms"].values():
            for field in ("entry", "hold", "gate", "release"):
                result.update(condition_entities(room[field]))
            for door in room["doors"]:
                result.update(condition_entities(door))
        for resident in self.config["residents"].values():
            result.add(resident["entity_id"])
            result.update(condition_entities(resident["sleep_source"]))
        result.update(condition_entities(self.config["home"]["entity"]))
        for mode in self.config["home"]["modes"]:
            result.update(condition_entities(mode["condition"]))
        return result

    def _subscribe(self) -> None:
        if self.unlisten:
            self.unlisten()
        sources = self.sources()
        self.unlisten = (
            async_track_state_change_event(self.hass, sources, self._changed)
            if sources
            else None
        )

    @callback
    def _changed(self, event) -> None:
        self.recompute(Context(parent_id=event.context.id))

    @callback
    def _due(self, now) -> None:
        self.timer = None
        self.recompute()

    @callback
    def recompute(self, context: Context | None = None) -> None:
        if self.stopped:
            return
        self.context = context or Context()
        previous = self.engine.snapshot
        now = dt_util.utcnow()
        states = {
            key: {"state": state.state, "attributes": dict(state.attributes)}
            for key in self.sources()
            if (state := self.hass.states.get(key))
        }
        current = self.engine.evaluate(states, now.timestamp(), dt_util.as_local(now))
        if self.timer:
            self.timer()
            self.timer = None
        deadline = current["next_deadline"]
        if deadline is not None:
            self.timer = async_track_point_in_utc_time(
                self.hass,
                self._due,
                dt_util.utc_from_timestamp(max(deadline, now.timestamp() + 0.05)),
            )
        self._activity(previous, current)
        self.notify()
        data = self._stored()
        if data != self._last_store:
            self._last_store = deepcopy(data)
            self.store.async_delay_save(self._stored, 1)

    def output_id(
        self, scope: str, key: str = "", kind: str = "presence"
    ) -> str | None:
        domain = (
            "sensor"
            if kind in ("mode", "present_count", "awake_count", "sleeping_count")
            else "binary_sensor"
        )
        return er.async_get(self.hass).async_get_entity_id(
            domain, DOMAIN, f"{scope}_{key}_{kind}"
        )

    def _activity(self, old: dict, new: dict) -> None:
        for key, room in new["rooms"].items():
            if (
                key in old["rooms"]
                and old["rooms"][key]["occupied"] != room["occupied"]
            ):
                if entity := self.output_id("room", key):
                    record(
                        self.hass,
                        entity,
                        room["occupied"],
                        room["reason"],
                        self.context,
                    )
        for field in ("occupied", "mode"):
            if field in old["home"] and old["home"][field] != new["home"][field]:
                if entity := self.output_id(
                    "home", kind="mode" if field == "mode" else "presence"
                ):
                    value = new["home"][field]
                    record(
                        self.hass,
                        entity,
                        self.mode_name(value) if field == "mode" and value else value,
                        "home_rule",
                        self.context,
                    )
        for key, resident in new["residents"].items():
            for field, kind in (("present", "presence"), ("sleeping", "sleeping")):
                if (
                    key in old["residents"]
                    and old["residents"][key][field] != resident[field]
                ):
                    if entity := self.output_id("resident", key, kind):
                        record(
                            self.hass,
                            entity,
                            resident[field],
                            "resident_sleep"
                            if kind == "sleeping"
                            else "resident_presence",
                            self.context,
                        )

    @callback
    def notify(self) -> None:
        for listener in tuple(self.listeners):
            listener()
        self.hass.bus.async_fire(SIGNAL_UPDATED)

    @callback
    def async_add_listener(self, listener):
        self.listeners.add(listener)
        return lambda: self.listeners.discard(listener)

    def _stored(self) -> dict:
        return {
            "config": deepcopy(self.config),
            "revision": self.revision,
            "runtime": self.engine.dump(),
        }

    async def async_save(self, config: dict, revision: int) -> None:
        validated = validate_config(config)
        registry = er.async_get(self.hass)
        # Catch renamed Hapo outputs as well as the standard prefix.
        current_config = self.config
        self.config = validated
        try:
            sources = self.sources()
        finally:
            self.config = current_config
        if any(
            (entry := registry.async_get(source)) and entry.platform == DOMAIN
            for source in sources
        ):
            raise HapoError("use_internal_reference")
        async with self.lock:
            if revision != self.revision:
                raise HapoError("revision_conflict")
            runtime = self.engine.dump()
            for key, room in validated["rooms"].items():
                if room != self.config["rooms"].get(key):
                    runtime["rooms"].pop(key, None)
            for key, resident in validated["residents"].items():
                if resident != self.config["residents"].get(key):
                    runtime["residents"].pop(key, None)
            runtime["sleep_overrides"] = {
                k: v
                for k, v in runtime["sleep_overrides"].items()
                if k in validated["residents"]
            }
            if runtime["home_override"] and runtime["home_override"]["mode"] not in {
                m["id"] for m in validated["home"]["modes"]
            }:
                runtime["home_override"] = None
            candidates = Engine(validated, runtime)

            # A panel save is not a restart: preserve verified door continuity
            # and running timers for unchanged calculations, including renames.
            def calculation(item):
                return {k: v for k, v in item.items() if k not in ("name", "area_id")}

            for key, room in validated["rooms"].items():
                if calculation(room) == calculation(self.config["rooms"].get(key, {})):
                    candidates.rooms[key] = deepcopy(self.engine.rooms[key])
                    candidates.rooms[key].config = room
            for key, resident in validated["residents"].items():
                if calculation(resident) == calculation(
                    self.config["residents"].get(key, {})
                ):
                    candidates.presence[key] = deepcopy(self.engine.presence[key])
                    candidates.sleep[key] = deepcopy(self.engine.sleep[key])
            if validated["home"] == self.config["home"]:
                candidates.conditions = self.engine.conditions
            candidates.snapshot = self.engine.snapshot
            stored = {
                "config": validated,
                "revision": self.revision + 1,
                "runtime": candidates.dump(),
            }
            await self.store.async_save(stored)
            # Source events can arrive while the atomic file write yields.
            # Carry their latest continuity into unchanged calculations.
            for key, room in validated["rooms"].items():
                if calculation(room) == calculation(self.config["rooms"].get(key, {})):
                    candidates.rooms[key] = deepcopy(self.engine.rooms[key])
                    candidates.rooms[key].config = room
            for key, resident in validated["residents"].items():
                if calculation(resident) == calculation(
                    self.config["residents"].get(key, {})
                ):
                    candidates.presence[key] = deepcopy(self.engine.presence[key])
                    candidates.sleep[key] = deepcopy(self.engine.sleep[key])
            candidates.sleep_overrides = {
                k: v
                for k, v in self.engine.sleep_overrides.items()
                if k in validated["residents"]
            }
            candidates.snapshot = self.engine.snapshot
            self.config, self.engine = validated, candidates
            self.revision += 1
            self._subscribe()
            self.recompute()

    def name(self, scope: str, key: str) -> str:
        if scope == "home":
            return "Hapo"
        item = self.config["rooms" if scope == "room" else "residents"].get(key, {})
        if item.get("name"):
            return item["name"]
        area = (
            ar.async_get(self.hass).async_get_area(item.get("area_id", ""))
            if scope == "room"
            else None
        )
        if area:
            return area.name
        state = (
            self.hass.states.get(item.get("entity_id", ""))
            if scope == "resident"
            else None
        )
        return state.name if state else key

    def mode_name(self, key: str) -> str:
        mode = next((m for m in self.config["home"]["modes"] if m["id"] == key), {})
        if mode.get("name"):
            return mode["name"]
        labels = {
            "away": ("Away", "Vide"),
            "sleeping": ("Sleeping", "Dort"),
            "quiet": ("Quiet", "Calme"),
            "active": ("Active", "Vie"),
        }
        fr = self.hass.config.language.lower().replace("_", "-").startswith("fr")
        return labels.get(key, (key, key))[int(fr)]

    async def authorize(self, context: Context | None, scope: str, key: str) -> None:
        if context and context.user_id:
            user = await self.hass.auth.async_get_user(context.user_id)
            entity = self.output_id(scope, key)
            if (
                not user
                or not user.is_active
                or not (
                    user.is_admin
                    or entity
                    and user.permissions.check_entity(entity, POLICY_CONTROL)
                )
            ):
                raise Unauthorized()

    async def async_command(
        self,
        command: str,
        target: str,
        value: Any,
        seconds: float,
        context: Context | None = None,
    ) -> None:
        duration(seconds)
        scope = (
            "room"
            if command == "room_override"
            else "resident"
            if command == "sleep"
            else "home"
        )
        await self.authorize(context, scope, target)
        now = dt_util.utcnow().timestamp()
        until = now + seconds if seconds else None
        async with self.lock:
            if command == "room_override":
                if target not in self.engine.rooms or value not in (
                    "auto",
                    "occupied",
                    "clear",
                ):
                    raise HapoError("invalid_target")
                self.engine.rooms[target].override = (
                    None
                    if value == "auto"
                    else {"occupied": value == "occupied", "until": until}
                )
            elif command == "home_override":
                if value != "auto" and value not in {
                    m["id"] for m in self.config["home"]["modes"]
                }:
                    raise HapoError("invalid_mode")
                self.engine.home_override = (
                    None if value == "auto" else {"mode": value, "until": until}
                )
            elif command == "sleep":
                if value == "toggle":
                    sleeping = (
                        self.engine.snapshot["residents"]
                        .get(target, {})
                        .get("sleeping")
                    )
                    if sleeping is None:
                        raise HapoError("sleep_unknown")
                    value = "awake" if sleeping else "sleeping"
                if target not in self.config["residents"] or value not in (
                    "auto",
                    "awake",
                    "sleeping",
                ):
                    raise HapoError("invalid_target")
                if value == "auto":
                    self.engine.sleep_overrides.pop(target, None)
                else:
                    self.engine.sleep_overrides[target] = value == "sleeping"
            elif command == "guests":
                if not isinstance(value, bool):
                    raise HapoError("invalid_boolean")
                self.engine.guests = value
            else:
                raise HapoError("invalid_command")
            self.recompute(context)
            await self.store.async_save(self._stored())

    def snapshot(self, user) -> dict:
        runtime = deepcopy(self.engine.snapshot)
        names = {
            "rooms": {key: self.name("room", key) for key in self.config["rooms"]},
            "residents": {
                key: self.name("resident", key) for key in self.config["residents"]
            },
            "modes": {
                # Default labels follow the viewer's language in the panel;
                # explicit names are kept verbatim, including for read-only users.
                m["id"]: m["name"]
                for m in self.config["home"]["modes"]
            },
        }
        if not user.is_admin:
            for collection, scope in (("rooms", "room"), ("residents", "resident")):
                for key in list(runtime[collection]):
                    entity = self.output_id(scope, key)
                    if not entity or not user.permissions.check_entity(
                        entity, POLICY_READ
                    ):
                        runtime[collection].pop(key)
                        names[collection].pop(key)
                    elif collection == "rooms":
                        runtime[collection][key]["evidence"] = [
                            e
                            for e in runtime[collection][key]["evidence"]
                            if user.permissions.check_entity(e, POLICY_READ)
                        ]
            entity = self.output_id("home")
            if not entity or not user.permissions.check_entity(entity, POLICY_READ):
                runtime["home"] = {}
                names["modes"] = {}
                runtime["next_deadline"] = None
        result = {
            "revision": self.revision,
            "instance_id": self.entry.entry_id,
            "runtime": runtime,
            "names": names,
            "admin": user.is_admin,
        }
        if user.is_admin:
            choices = catalog(self.hass)
            result.update(
                config=deepcopy(self.config),
                catalog=choices,
                suggestions={
                    area["area_id"]: suggestions(choices["entities"], area["area_id"])
                    for area in choices["areas"]
                },
            )
        return result

    async def async_stop(self) -> None:
        self.stopped = True
        for remove in [self.unlisten, self.timer, *self.removers]:
            if remove:
                remove()
        self.listeners.clear()
        if self.loaded:
            await self.store.async_save(self._stored())
