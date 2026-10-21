"""Deterministic presence state machines; no Home Assistant imports or I/O."""

from copy import deepcopy
from datetime import datetime

from .conditions import Conditions, any_value
from .models import dependency_order


class StableValue:
    """Debounce valid changes and bound retention of inconclusive evidence."""

    def __init__(self, stored: dict | None = None) -> None:
        stored = stored or {}
        self.value = stored.get("value")
        self.candidate = stored.get("candidate")
        self.candidate_since = stored.get("candidate_since")
        self.stale_since = stored.get("stale_since")
        self.deadline = None
        self.degraded = False
        self.pending = False

    def update(self, desired, now: float, grace: float, delay: float = 0):
        self.deadline = None
        self.pending = False
        self.degraded = desired is None
        if desired is None:
            self.candidate = self.candidate_since = None
            if self.stale_since is None:
                self.stale_since = now
            if self.value is not None and now < self.stale_since + grace:
                self.deadline = self.stale_since + grace
            else:
                self.value = None
            return self.value
        self.stale_since = None
        if desired == self.value:
            self.candidate = self.candidate_since = None
        else:
            if self.candidate != desired or self.candidate_since is None:
                self.candidate, self.candidate_since = desired, now
            deadline = self.candidate_since + delay
            if now >= deadline:
                self.value = desired
                self.candidate = self.candidate_since = None
            else:
                self.pending = True
                self.deadline = deadline
        return self.value

    def dump(self) -> dict:
        return {
            "value": self.value,
            "stale_since": self.stale_since,
            "candidate": self.candidate,
            "candidate_since": self.candidate_since,
            "deadline": self.deadline,
        }


class RoomEngine:
    def __init__(self, config: dict, stored: dict | None = None) -> None:
        self.config = config
        self.stable = StableValue(stored)
        self.conditions = Conditions()
        # Door continuity cannot be verified across a reload. Resume normal
        # source evaluation; do not restore a latch or a legacy reconfirm wait.
        self.latched = False
        self.latched_at = None
        self.closed_since = None
        self.previous_doors = None
        self.anticipation_until = None
        self.entry_since = None
        self.opening_armed = False
        self.recovery_until = None
        self.override = (stored or {}).get("override")

    def _clear_opening(self) -> None:
        self.opening_armed = False
        self.recovery_until = None

    def _reset_entry_confirmation(self) -> None:
        self.entry_since = None
        if self.stable.candidate is True:
            self.stable.candidate = self.stable.candidate_since = None

    def _guard_bee_entry(self, entry, doors, now: float, permitted: bool):
        """Limit new evidence to an observed passage and its fixed retry window."""
        if not permitted or doors is None:
            self._clear_opening()
            self._reset_entry_confirmation()
            self.anticipation_until = None
            return None if doors is None else False
        if doors is True:
            if self.previous_doors is not True:
                # Motion before the passage must not prepay its confirmation.
                self._reset_entry_confirmation()
            self.opening_armed = True
            self.recovery_until = None
            return entry
        if self.latched:
            return entry
        if self.opening_armed:
            if self.recovery_until is None:
                self.recovery_until = (
                    now + self.config["close_delay"] + self.config["recovery_delay"]
                )
                if self.anticipation_until is not None:
                    self.anticipation_until = min(
                        self.anticipation_until, self.recovery_until
                    )
            if now < self.recovery_until:
                return entry
            # Only an uninterrupted attempt begun before expiry may finish.
            # Its on_delay deadline bounds this exception; no new retry is armed.
            if (
                entry is True
                and self.entry_since is not None
                and self.entry_since < self.recovery_until
            ):
                return entry
        self._clear_opening()
        self._reset_entry_confirmation()
        return None if entry is None else False

    def evaluate(
        self,
        states: dict,
        facts: dict,
        rooms: dict,
        mode: str | None,
        now: float,
        local: datetime,
        grace: float,
    ) -> dict:
        c = self.config
        self.conditions.begin()
        deadlines = []

        def evaluate(field: str, default=False):
            return self.conditions.evaluate(
                c[field], states, facts, rooms, mode, now, local, field, default
            )

        entry, hold = evaluate("entry", None), evaluate("hold")
        gate, release = evaluate("gate", True), evaluate("release")
        doors = (
            any_value(
                [
                    self.conditions.evaluate(
                        d, states, facts, rooms, mode, now, local, f"door.{i}"
                    )
                    for i, d in enumerate(c["doors"])
                ]
            )
            if c["doors"]
            else False
        )
        profile = c["profile"]
        guarded_bee = profile == "bee" and c["require_opening"]
        if guarded_bee:
            active_override = self.override and (
                self.override.get("until") is None or now < self.override["until"]
            )
            entry = self._guard_bee_entry(
                entry,
                doors,
                now,
                c["enabled"]
                and gate is True
                and release is False
                and not active_override,
            )
        reason, desired = "no_activity", entry
        anticipation_expired = False
        if entry is True:
            if self.entry_since is None:
                self.entry_since = now
        else:
            self.entry_since = None
        confirmed_entry = entry is True and now >= self.entry_since + c["on_delay"]
        if profile == "bee" and entry is True and not confirmed_entry:
            deadlines.append(self.entry_since + c["on_delay"])
        if doors is True and self.previous_doors is False and c["anticipate"]:
            self.anticipation_until = now + max(c["off_delay"], c["open_delay"], 1)
        if entry is True:
            # Actual detection takes over the normal inactivity timer.
            self.anticipation_until = None
        if self.anticipation_until is not None:
            if now >= self.anticipation_until:
                self.anticipation_until = None
                anticipation_expired = True
            else:
                deadlines.append(self.anticipation_until)
        if profile in ("hybrid", "contextual"):
            if entry is True:
                desired = True
            elif self.stable.value is True and profile == "contextual":
                desired = True
                reason = "context_maintained"
            elif self.stable.value is True:
                desired = any_value([entry, hold])
                if hold is True:
                    reason = "holding_source"
            else:
                desired = entry
        if profile == "bee":
            if doors is not False:
                self.latched = False
                self.latched_at = self.closed_since = None
                if doors is None and entry is not True:
                    desired = None
            else:
                if self.closed_since is None:
                    self.closed_since = now
                settle = self.closed_since + c["close_delay"]
                if now < settle and (not guarded_bee or self.opening_armed):
                    deadlines.append(settle)
                    # Do not infer an exit during sensor stabilization.
                    if self.stable.value is True and entry is not True:
                        desired = True
                        reason = "door_stabilizing"
                elif confirmed_entry:
                    if not self.latched:
                        self.latched_at = now
                    self.latched = True
                    if guarded_bee:
                        self._clear_opening()
                if self.latched and c["latch_max"]:
                    expiry = self.latched_at + c["latch_max"]
                    if now >= expiry:
                        self.latched = False
                        self.latched_at = None
                        if guarded_bee:
                            self._clear_opening()
                            self._reset_entry_confirmation()
                            entry = desired = False
                    else:
                        deadlines.append(expiry)
                if self.latched:
                    desired, reason = True, "closed_box"
                elif entry is False and now >= settle:
                    reason = "unconfirmed_presence"
                if guarded_bee and not self.latched:
                    if not self.opening_armed and entry is not None:
                        desired, reason = False, "waiting_for_opening"
                    elif entry is False and desired is not True:
                        reason = "entry_recovery"
        if c["keep_open"] and doors is True:
            desired, reason = True, "door_open"
        elif self.anticipation_until is not None and desired is not True:
            desired, reason = True, "door_anticipation"
        if entry is True:
            reason = "presence_source" if reason != "closed_box" else reason
        if release is True or gate is False:
            desired, reason = (
                False,
                "released" if release is True else "context_blocked",
            )
            self.latched = False
            self.latched_at = None
            self.anticipation_until = None
        elif gate is None or release is None:
            desired, reason = None, "missing_source"
        self.previous_doors = doors
        if self.override:
            expires = self.override.get("until")
            if expires is not None and now >= expires:
                self.override = None
            else:
                desired, reason = self.override["occupied"], "manual_override"
                if expires is not None:
                    deadlines.append(expires)
        if not c["enabled"]:
            desired, reason = None, "disabled"
            self.latched = False
        if self.recovery_until is not None and now < self.recovery_until:
            deadlines.append(self.recovery_until)
        off_delay = (
            c["open_delay"] if profile == "bee" and doors is True else c["off_delay"]
        )
        if anticipation_expired:
            off_delay = 0
        delay = 0 if self.override else c["on_delay"] if desired else off_delay
        occupied = self.stable.update(desired, now, grace if c["enabled"] else 0, delay)
        if self.stable.deadline is not None:
            deadlines.append(self.stable.deadline)
        deadlines += self.conditions.deadlines
        if self.stable.degraded and c["enabled"]:
            reason = "missing_source"
        elif self.stable.pending:
            reason = "confirming_presence" if desired else "absence_countdown"
        return {
            "occupied": occupied,
            "reason": reason,
            "degraded": self.stable.degraded,
            "pending": self.stable.pending,
            "latched": self.latched,
            "recovery_until": self.recovery_until,
            "override": deepcopy(self.override),
            "evidence": sorted(self.conditions.evidence),
            "next_deadline": min(deadlines) if deadlines else None,
        }

    def dump(self) -> dict:
        return self.stable.dump() | {
            "override": deepcopy(self.override),
            "latched": self.latched,
        }


class Engine:
    """Evaluate residents, facts, rooms and mode in an acyclic order."""

    def __init__(self, config: dict, stored: dict | None = None) -> None:
        self.config = config
        stored = stored or {}
        self.rooms = {
            key: RoomEngine(room, stored.get("rooms", {}).get(key))
            for key, room in config["rooms"].items()
        }
        self.presence = {
            key: StableValue(stored.get("residents", {}).get(key))
            for key in config["residents"]
        }
        self.sleep = {
            key: StableValue(stored.get("sleep", {}).get(key))
            for key in config["residents"]
        }
        self.sleep_overrides = deepcopy(stored.get("sleep_overrides", {}))
        self.guests = bool(stored.get("guests", False))
        self.home_override = stored.get("home_override")
        self.home_value = StableValue(stored.get("home"))
        self.mode_value = StableValue(stored.get("mode"))
        self.conditions = Conditions()
        self.order = dependency_order(config)
        self.snapshot: dict = {"rooms": {}, "residents": {}, "home": {}}

    def evaluate(self, states: dict, now: float, local: datetime) -> dict:
        self.conditions.begin()
        grace = self.config["failure_grace"]
        residents, rooms, facts, deadlines = {}, {}, {}, []
        mode = self.mode_value.value
        for key, resident in self.config["residents"].items():
            raw = states.get(resident["entity_id"], {}).get("state")
            desired = (
                None
                if raw in (None, "unknown", "unavailable")
                else raw in resident["home_states"]
            )
            stable = self.presence[key]
            present = stable.update(desired, now, grace, resident["presence_delay"])
            if stable.deadline:
                deadlines.append(stable.deadline)
            if present is False and not stable.degraded and not stable.pending:
                self.sleep_overrides.pop(key, None)
            source = self.conditions.evaluate(
                resident["sleep_source"],
                states,
                {},
                {},
                None,
                now,
                local,
                "resident." + key,
            )
            sleeping = self.sleep_overrides.get(key, source)
            if stable.degraded or stable.pending:
                sleeping = None
            elif present is not True:
                sleeping = False if present is False else None
            sleep = self.sleep[key]
            sleeping = sleep.update(sleeping, now, grace)
            if sleep.deadline is not None:
                deadlines.append(sleep.deadline)
            residents[key] = {
                "present": present,
                "sleeping": sleeping,
                "manual_sleep": key in self.sleep_overrides,
                "degraded": stable.degraded,
                "sleep_degraded": sleep.degraded,
                "pending": stable.pending,
                "next_deadline": min(
                    (v for v in (stable.deadline, sleep.deadline) if v is not None),
                    default=None,
                ),
            }
        for node in self.order:
            if node == "facts":
                values = list(residents.values())
                reliable = bool(values) and all(
                    v["present"] is not None and not v["degraded"] and not v["pending"]
                    for v in values
                )
                present = [v for v in values if v["present"] is True]
                sleep_known = reliable and all(
                    v["sleeping"] is not None and not v["sleep_degraded"]
                    for v in present
                )
                source = self.config["home"]["source"]
                if source == "residents":
                    occupied = (
                        any_value(
                            [
                                v["present"]
                                if not v["degraded"] and not v["pending"]
                                else None
                                for v in values
                            ]
                        )
                        if values
                        else None
                    )
                elif source == "rooms":
                    occupied = any_value(
                        [
                            rooms.get(r, {}).get("occupied")
                            if not rooms.get(r, {}).get("degraded")
                            else None
                            for r in self.config["home"]["rooms"]
                        ]
                    )
                else:
                    occupied = self.conditions.evaluate(
                        self.config["home"]["entity"],
                        states,
                        {},
                        {},
                        None,
                        now,
                        local,
                        "home.source",
                    )
                if self.guests:
                    occupied = True
                self.home_value.update(occupied, now, grace)
                if self.home_value.deadline:
                    deadlines.append(self.home_value.deadline)
                # Rules consume fresh facts, not a retained degraded result.
                sleeping_count = (
                    sum(v["sleeping"] is True for v in present) if sleep_known else None
                )
                awake_count = len(present) - sleeping_count if sleep_known else None
                facts = {
                    "occupied": occupied,
                    "present_count": len(present) if reliable else None,
                    "sleeping_count": sleeping_count,
                    "awake_count": awake_count,
                    "counts_known": sleep_known and not self.guests,
                    "guests": self.guests,
                    "any_sleeping": (sleeping_count > 0)
                    if sleep_known
                    else (False if source != "residents" and not values else None),
                    "all_sleeping": bool(present)
                    and awake_count == 0
                    and not self.guests
                    if sleep_known
                    else False
                    if not values and source != "residents"
                    else None,
                }
                if self.guests:
                    facts["all_sleeping"] = False
                    if not values or (reliable and not present):
                        facts["any_sleeping"] = False
            elif node == "mode":
                selected = None
                for candidate in self.config["home"]["modes"]:
                    result = self.conditions.evaluate(
                        candidate["condition"],
                        states,
                        facts,
                        rooms,
                        mode,
                        now,
                        local,
                        "mode." + candidate["id"],
                    )
                    if result is None:
                        # A higher-priority unknown rule must not silently be
                        # bypassed, e.g. 'everyone away' before an active rule.
                        break
                    if result:
                        selected = candidate["id"]
                        break
                if self.home_override:
                    expiry = self.home_override.get("until")
                    if expiry is not None and now >= expiry:
                        self.home_override = None
                    else:
                        selected = self.home_override["mode"]
                        if expiry:
                            deadlines.append(expiry)
                mode = self.mode_value.update(selected, now, grace)
                if self.mode_value.deadline:
                    deadlines.append(self.mode_value.deadline)
            else:
                key = node.removeprefix("room:")
                # Unknown/degraded room outputs must remain unknown to rules,
                # while their retained display state may still be occupied.
                room_facts = {
                    r: v | {"occupied": None} if v["degraded"] else v
                    for r, v in rooms.items()
                }
                rooms[key] = self.rooms[key].evaluate(
                    states,
                    facts,
                    room_facts,
                    None if self.mode_value.degraded else mode,
                    now,
                    local,
                    grace,
                )
                if rooms[key]["next_deadline"]:
                    deadlines.append(rooms[key]["next_deadline"])
        deadlines += self.conditions.deadlines
        self.snapshot = {
            "rooms": rooms,
            "residents": residents,
            "home": facts
            | {
                "occupied": self.home_value.value,
                "mode": mode,
                "degraded": self.home_value.degraded or self.mode_value.degraded,
                "override": deepcopy(self.home_override),
                "next_deadline": min(deadlines) if deadlines else None,
            },
            "next_deadline": min(deadlines) if deadlines else None,
        }
        return deepcopy(self.snapshot)

    def dump(self) -> dict:
        return {
            "rooms": {key: room.dump() for key, room in self.rooms.items()},
            "residents": {key: value.dump() for key, value in self.presence.items()},
            "sleep": {key: value.dump() for key, value in self.sleep.items()},
            "sleep_overrides": deepcopy(self.sleep_overrides),
            "guests": self.guests,
            "home_override": deepcopy(self.home_override),
            "home": self.home_value.dump(),
            "mode": self.mode_value.dump(),
        }
