"""Occupancy and resident sleep results, including indeterminate states."""

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)

from .entity import HapoEntity, setup_entities


async def async_setup_entry(hass, entry, async_add_entities):
    def factory(manager):
        yield HapoBinary(manager, "home", "", "presence")
        for key in manager.config["rooms"]:
            yield HapoBinary(manager, "room", key, "presence")
        for key in manager.config["residents"]:
            for kind in ("presence", "sleeping"):
                yield HapoBinary(manager, "resident", key, kind)

    await setup_entities(hass, entry, async_add_entities, factory)


class HapoBinary(HapoEntity, BinarySensorEntity):
    def __init__(self, manager, scope, key, kind):
        super().__init__(manager, scope, key, kind, "binary_sensor")
        if kind == "presence":
            self._attr_device_class = (
                BinarySensorDeviceClass.PRESENCE
                if scope == "resident"
                else BinarySensorDeviceClass.OCCUPANCY
            )
        else:
            self._attr_icon = "mdi:sleep"

    @property
    def is_on(self):
        field = (
            "sleeping"
            if self.kind == "sleeping"
            else "present"
            if self.scope == "resident"
            else "occupied"
        )
        return self.runtime.get(field)
