"""Hapo — local home and room presence orchestration."""

from homeassistant.const import Platform
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .manager import HapoManager
from .panel import async_register_panel, async_remove_panel
from .services import async_register_services
from .websocket import async_register

PLATFORMS = (
    Platform.BINARY_SENSOR,
    Platform.SENSOR,
    Platform.SWITCH,
    Platform.SELECT,
    Platform.BUTTON,
)


async def async_setup_entry(hass, entry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    manager = entry.runtime_data = HapoManager(hass, entry)
    try:
        await manager.async_load()
        data["manager"] = manager
        if not data.get("api_registered"):
            async_register(hass)
            async_register_services(hass)
            data["api_registered"] = True
        await async_register_panel(hass)
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        await manager.async_stop()
        data.pop("manager", None)
        async_remove_panel(hass)
        raise
    manager.notify()
    return True


async def async_unload_entry(hass, entry) -> bool:
    if unloaded := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        await entry.runtime_data.async_stop()
        hass.data[DOMAIN].pop("manager", None)
        async_remove_panel(hass)
    return unloaded


async def async_remove_entry(hass, entry) -> None:
    await Store(hass, 1, f"{DOMAIN}.{entry.entry_id}").async_remove()
