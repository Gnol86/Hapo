"""Native manual controls; automatic results remain separate sensors."""

from homeassistant.components.select import SelectEntity

from .entity import HapoEntity, setup_entities


async def async_setup_entry(hass, entry, async_add_entities):
    def factory(manager):
        yield HapoSelect(manager, "home", "", "home_override")
        for key in manager.config["rooms"]:
            yield HapoSelect(manager, "room", key, "room_override")
        for key in manager.config["residents"]:
            yield HapoSelect(manager, "resident", key, "sleep")

    await setup_entities(hass, entry, async_add_entities, factory)


class HapoSelect(HapoEntity, SelectEntity):
    def __init__(self, manager, scope, key, kind):
        super().__init__(manager, scope, key, kind, "select")

    @property
    def options(self):
        if self.scope == "room":
            return ["auto", "occupied", "clear"]
        if self.scope == "resident":
            return ["auto", "awake", "sleeping"]
        return ["auto", *[m["id"] for m in self.manager.config["home"]["modes"]]]

    @property
    def current_option(self):
        if self.scope == "resident":
            value = self.manager.engine.sleep_overrides.get(self.key)
            return "auto" if value is None else "sleeping" if value else "awake"
        override = self.runtime.get("override")
        if not override:
            return "auto"
        return (
            override["mode"]
            if self.scope == "home"
            else "occupied"
            if override["occupied"]
            else "clear"
        )

    async def async_select_option(self, option):
        await self.manager.async_command(self.kind, self.key, option, 0, self._context)
