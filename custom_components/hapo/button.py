"""Resume automatic room, home and sleep evaluation."""

from homeassistant.components.button import ButtonEntity

from .entity import HapoEntity, setup_entities


async def async_setup_entry(hass, entry, async_add_entities):
    def factory(manager):
        yield HapoResume(manager, "home", "")
        for key in manager.config["rooms"]:
            yield HapoResume(manager, "room", key)
        for key in manager.config["residents"]:
            yield HapoResume(manager, "resident", key)

    await setup_entities(hass, entry, async_add_entities, factory)


class HapoResume(HapoEntity, ButtonEntity):
    _attr_icon = "mdi:autorenew"

    def __init__(self, manager, scope, key):
        super().__init__(manager, scope, key, "resume", "button")

    async def async_press(self):
        command = {
            "room": "room_override",
            "resident": "sleep",
            "home": "home_override",
        }[self.scope]
        await self.manager.async_command(command, self.key, "auto", 0, self._context)
