"""Describe Hapo decision contexts in Home Assistant Activity."""

from homeassistant.core import callback

from .const import DOMAIN, EVENT_DECISION


@callback
def async_describe_events(hass, async_describe_event):
    @callback
    def describe(event):
        return {
            "name": "Hapo",
            "message": event.data["message"],
            "context_id": event.context_id,
        }

    async_describe_event(DOMAIN, EVENT_DECISION, describe)
