"""Authenticated and revision-checked panel API."""

import probatio
from homeassistant.components import websocket_api
from homeassistant.core import Context, callback
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, SIGNAL_UPDATED
from .manager import HapoError
from .models import validate_config


def manager(hass):
    if not (result := hass.data.get(DOMAIN, {}).get("manager")):
        raise HapoError("not_loaded")
    return result


async def handle(hass, connection, msg):
    try:
        current = manager(hass)
        if msg["type"] == "hapo/validate":
            connection.send_result(
                msg["id"], {"config": validate_config(msg["config"])}
            )
            return
        if msg["type"] == "hapo/subscribe":
            pending = None

            @callback
            def publish():
                nonlocal pending
                pending = None
                try:
                    connection.send_event(
                        msg["id"], manager(hass).snapshot(connection.user)
                    )
                except HapoError:
                    return

            @callback
            def changed(event):
                nonlocal pending
                if pending is None:
                    pending = hass.loop.call_later(0.1, publish)

            remove = hass.bus.async_listen(SIGNAL_UPDATED, changed)

            @callback
            def unsubscribe():
                remove()
                if pending:
                    pending.cancel()

            connection.subscriptions[msg["id"]] = unsubscribe
            connection.send_result(msg["id"])
            publish()
            return
        if msg["type"] == "hapo/save":
            await current.async_save(msg["config"], msg["revision"])
        elif msg["type"] == "hapo/command":
            await current.async_command(
                msg["command"],
                msg.get("target", ""),
                msg["value"],
                msg.get("duration", 0),
                Context(user_id=connection.user.id),
            )
        connection.send_result(msg["id"], current.snapshot(connection.user))
    except (HomeAssistantError, ValueError) as err:
        connection.send_error(msg["id"], str(err) or "command_failed", str(err))


@callback
def async_register(hass):
    for name, fields, admin in [
        ("hapo/get", {}, False),
        ("hapo/subscribe", {}, False),
        ("hapo/validate", {probatio.Required("config"): dict}, True),
        (
            "hapo/save",
            {probatio.Required("config"): dict, probatio.Required("revision"): int},
            True,
        ),
        (
            "hapo/command",
            {
                probatio.Required("command"): str,
                probatio.Optional("target", default=""): str,
                probatio.Required("value"): probatio.Any(str, bool),
                probatio.Optional("duration", default=0): probatio.Any(int, float),
            },
            False,
        ),
    ]:
        handler = websocket_api.async_response(handle)
        if admin:
            handler = websocket_api.require_admin(handler)
        handler = websocket_api.websocket_command(
            {probatio.Required("type"): name} | fields
        )(handler)
        websocket_api.async_register_command(hass, handler)
