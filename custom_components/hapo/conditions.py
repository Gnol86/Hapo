"""Three-valued conditions with hysteresis and continuous-duration timers."""

import operator
from datetime import datetime
from math import isfinite


def any_value(values: list[bool | None]) -> bool | None:
    return True if True in values else None if None in values else False


def all_values(values: list[bool | None]) -> bool | None:
    return False if False in values else None if None in values else True


class Conditions:
    """Transient evidence: never restore continuity across a process restart."""

    def __init__(self) -> None:
        self.since: dict[str, float] = {}
        self.hysteresis: dict[str, bool] = {}
        self.deadlines: list[float] = []
        self.evidence: set[str] = set()

    def begin(self) -> None:
        self.deadlines = []
        self.evidence = set()

    def evaluate(
        self,
        node: dict | None,
        states: dict,
        facts: dict,
        rooms: dict,
        home_mode: str | None,
        now: float,
        local: datetime,
        path: str,
        default: bool | None = False,
    ) -> bool | None:
        if node is None:
            return default
        kind = node["type"]
        if kind in ("and", "or", "not"):
            nodes = [node["condition"]] if kind == "not" else node["conditions"]
            values = [
                self.evaluate(
                    child, states, facts, rooms, home_mode, now, local, f"{path}.{i}"
                )
                for i, child in enumerate(nodes)
            ]
            if kind == "not":
                result = None if values[0] is None else not values[0]
            else:
                result = all_values(values) if kind == "and" else any_value(values)
        elif kind == "room":
            actual = rooms.get(node["room_id"], {}).get("occupied")
            result = None if actual is None else actual == node["occupied"]
        elif kind == "home_mode":
            result = None if home_mode is None else home_mode == node["mode_id"]
        elif kind == "fact":
            actual = facts.get(node["key"])
            operations = {
                "eq": operator.eq,
                "ne": operator.ne,
                "gt": operator.gt,
                "gte": operator.ge,
                "lt": operator.lt,
                "lte": operator.le,
            }
            result = (
                None
                if actual is None
                else operations[node.get("op", "eq")](actual, node["value"])
            )
        elif kind == "time":
            current = local.strftime("%H:%M:%S")
            after, before = node["after"], node["before"]
            result = (
                (current >= after or current < before)
                if after > before
                else after <= current < before
            )
            # Only scheduled while a time predicate exists. Minute boundaries
            # suffice for the panel's HH:MM inputs, second inputs remain exact.
            self.deadlines.append(
                now + (1 if len(after) > 5 or len(before) > 5 else 60 - local.second)
            )
        else:
            state = states.get(node["entity_id"])
            if not state or state.get("state") in ("unknown", "unavailable", None):
                result = None
            else:
                actual = (
                    state.get("attributes", {}).get(node["attribute"])
                    if node.get("attribute")
                    else state["state"]
                )
                if actual is None:
                    result = None
                elif kind == "state":
                    value = (
                        str(actual).lower() if isinstance(actual, bool) else str(actual)
                    )
                    result = value in node["states"]
                else:
                    try:
                        value = float(actual)
                        if isinstance(actual, bool) or not isfinite(value):
                            raise ValueError
                    except ValueError, TypeError, OverflowError:
                        result = None
                    else:
                        margin = (
                            node.get("hysteresis", 0)
                            if self.hysteresis.get(path)
                            else 0
                        )
                        low, high = node.get("above"), node.get("below")
                        result = (low is None or value > low - margin) and (
                            high is None or value < high + margin
                        )
                        self.hysteresis[path] = result
                if result is True:
                    self.evidence.add(node["entity_id"])
        wait = node.get("for", 0)
        if result is not True:
            self.since.pop(path, None)
        elif wait:
            deadline = self.since.setdefault(path, now) + wait
            if now < deadline:
                self.deadlines.append(deadline)
                result = False
        return result
