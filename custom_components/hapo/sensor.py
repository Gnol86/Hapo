"""Stable home mode keys and known resident counts."""

from homeassistant.components.sensor import SensorEntity

from .entity import HapoEntity, setup_entities


async def async_setup_entry(hass, entry, async_add_entities):
    await setup_entities(
        hass,
        entry,
        async_add_entities,
        lambda manager: [
            HapoSensor(manager, kind)
            for kind in ("mode", "present_count", "awake_count", "sleeping_count")
        ],
    )


class HapoSensor(HapoEntity, SensorEntity):
    def __init__(self, manager, kind):
        super().__init__(manager, "home", "", kind, "sensor")
        self._attr_icon = "mdi:home-account" if kind == "mode" else "mdi:account-group"

    @property
    def native_value(self):
        return self.runtime.get(self.kind)

    @property
    def extra_state_attributes(self):
        result = super().extra_state_attributes
        if self.kind == "mode":
            mode = next(
                (
                    m
                    for m in self.manager.config["home"]["modes"]
                    if m["id"] == self.native_value
                ),
                None,
            )
            result["mode_name"] = self.manager.mode_name(mode["id"]) if mode else None
            result["modes"] = {
                m["id"]: self.manager.mode_name(m["id"])
                for m in self.manager.config["home"]["modes"]
            }
        return result
