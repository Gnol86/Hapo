"""Stable logical devices, dynamic entity lifecycle and decision metadata."""

import asyncio

from homeassistant.core import callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import DeviceInfo, Entity
from homeassistant.util import slugify

from .const import DOMAIN


class HapoEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, manager, scope: str, key: str, kind: str, domain: str):
        self.manager, self.scope, self.key, self.kind = manager, scope, key, kind
        self._attr_unique_id = f"{scope}_{key}_{kind}"
        self._attr_translation_key = kind
        suffix = "override" if kind.endswith("_override") else kind
        self.entity_id = f"{domain}.hapo_{slugify(key) if key else 'home'}_{suffix}"

    @property
    def available(self) -> bool:
        if self.scope == "home":
            return not self.manager.stopped
        collection = "rooms" if self.scope == "room" else "residents"
        return self.key in self.manager.config[collection] and not self.manager.stopped

    @property
    def device_info(self):
        area = (
            self.manager.config["rooms"].get(self.key, {}).get("area_id")
            if self.scope == "room"
            else None
        )
        return DeviceInfo(
            identifiers={(DOMAIN, f"{self.scope}_{self.key}")},
            name=self.manager.name(self.scope, self.key),
            manufacturer="Hapo",
            model="Hapo",
            entry_type=dr.DeviceEntryType.SERVICE,
            suggested_area=(
                a.name
                if (a := ar.async_get(self.manager.hass).async_get_area(area))
                else None
            )
            if area
            else None,
        )

    @property
    def runtime(self) -> dict:
        snapshot = self.manager.engine.snapshot
        if self.scope == "home":
            return snapshot["home"]
        return snapshot["rooms" if self.scope == "room" else "residents"].get(
            self.key, {}
        )

    @property
    def extra_state_attributes(self):
        fields = (
            "reason",
            "degraded",
            "pending",
            "latched",
            "next_deadline",
            "override",
        )
        result = {
            key: value for key in fields if (value := self.runtime.get(key)) is not None
        } | {"hapo_id": self.key, "hapo_scope": self.scope}
        if self.kind == "sleeping":
            result["degraded"] = self.runtime.get("sleep_degraded", False)
        return result

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.manager.async_add_listener(self._updated))
        self._updated()

    @callback
    def _updated(self):
        self._context = self.manager.context
        self.async_write_ha_state()


async def setup_entities(hass, entry, async_add_entities, factory):
    manager = entry.runtime_data
    known = {}
    lock = asyncio.Lock()

    async def reconcile():
        async with lock:
            desired = {(e.scope, e.key, e.kind): e for e in factory(manager)}
            registry = er.async_get(hass)
            for key in set(known) - set(desired):
                entity = known.pop(key)
                if registered := registry.async_get(entity.entity_id):
                    if registered.platform == DOMAIN:
                        registry.async_remove(entity.entity_id)
                elif entity.hass:
                    await entity.async_remove()
            added = [entity for key, entity in desired.items() if key not in known]
            known.update({(e.scope, e.key, e.kind): e for e in added})
            if added:
                async_add_entities(added)
            devices = dr.async_get(hass)
            for entity in known.values():
                if device := devices.async_get_device_by_identifier(
                    (DOMAIN, f"{entity.scope}_{entity.key}"), entry.entry_id
                ):
                    name = manager.name(entity.scope, entity.key)
                    area = (
                        manager.config["rooms"].get(entity.key, {}).get("area_id")
                        if entity.scope == "room"
                        else None
                    )
                    if device.name != name or (
                        entity.scope == "room" and device.area_id != area
                    ):
                        devices.async_update_device(
                            device.id,
                            name=name,
                            **({"area_id": area} if entity.scope == "room" else {}),
                        )
            valid = (
                {(DOMAIN, "home_")}
                | {(DOMAIN, f"room_{key}") for key in manager.config["rooms"]}
                | {(DOMAIN, f"resident_{key}") for key in manager.config["residents"]}
            )
            for device in dr.async_entries_for_config_entry(devices, entry.entry_id):
                if not device.identifiers.intersection(
                    valid
                ) and not er.async_entries_for_device(registry, device.id):
                    devices.async_remove_device(device.id)

    @callback
    def changed():
        if not manager.stopped:
            entry.async_create_task(hass, reconcile(), "Reconcile Hapo entities")

    entry.async_on_unload(manager.async_add_listener(changed))
    await reconcile()
