"""Support bundle with local identifiers and state values removed."""

import hashlib


async def async_get_config_entry_diagnostics(hass, entry):
    manager = entry.runtime_data

    def anonymous(value):
        return hashlib.sha256((entry.entry_id + value).encode()).hexdigest()[:12]

    return {
        "version": 1,
        "revision": manager.revision,
        "home_source": manager.config["home"]["source"],
        "room_count": len(manager.config["rooms"]),
        "resident_count": len(manager.config["residents"]),
        "rooms": [
            {
                "id": anonymous(key),
                "profile": room["profile"],
                "enabled": room["enabled"],
                "door_count": len(room["doors"]),
                "degraded": manager.engine.snapshot["rooms"]
                .get(key, {})
                .get("degraded"),
            }
            for key, room in manager.config["rooms"].items()
        ],
    }
