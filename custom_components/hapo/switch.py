"""Explicit guest presence exception."""

from homeassistant.components.switch import SwitchEntity

from .entity import HapoEntity, setup_entities


async def async_setup_entry(hass, entry, async_add_entities):
    await setup_entities(
        hass, entry, async_add_entities, lambda manager: [HapoGuests(manager)]
    )


class HapoGuests(HapoEntity, SwitchEntity):
    _attr_icon = "mdi:account-multiple-plus"

    def __init__(self, manager):
        super().__init__(manager, "home", "", "guests", "switch")

    @property
    def is_on(self):
        return self.manager.engine.guests

    async def async_turn_on(self, **kwargs):
        await self.manager.async_command("guests", "", True, 0, self._context)

    async def async_turn_off(self, **kwargs):
        await self.manager.async_command("guests", "", False, 0, self._context)
