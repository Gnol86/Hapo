"""Public services for existing buttons and automations."""

import probatio
from homeassistant.core import callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .websocket import manager


@callback
def async_register_services(hass):
    async def call(service):
        data = service.data
        await manager(hass).async_command(
            service.service,
            data.get("target_id", ""),
            data["value"],
            data.get("duration", 0),
            service.context,
        )

    for name, values in [
        ("room_override", ("auto", "occupied", "clear")),
        ("home_override", None),
        ("sleep", ("auto", "awake", "sleeping", "toggle")),
        ("guests", bool),
    ]:
        schema = {
            probatio.Required("value"): cv.boolean
            if values is bool
            else probatio.In(values)
            if values
            else cv.string,
            probatio.Optional("duration", default=0): probatio.All(
                probatio.Coerce(float), probatio.Range(min=0, max=604800)
            ),
        }
        if name in ("room_override", "sleep"):
            schema[probatio.Required("target_id")] = cv.string
        hass.services.async_register(DOMAIN, name, call, schema=probatio.Schema(schema))
