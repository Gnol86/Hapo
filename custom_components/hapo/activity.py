"""Native activity for actual Hapo state changes, with causal context."""

from homeassistant.const import EVENT_LOGBOOK_ENTRY
from homeassistant.core import Context, HomeAssistant, callback

from .const import EVENT_DECISION

REASONS = {
    "presence_source": ("presence detected", "présence détectée"),
    "no_activity": ("absence confirmed", "absence confirmée"),
    "holding_source": ("maintained by a sensor", "maintenue par un capteur"),
    "closed_box": (
        "presence retained behind closed doors",
        "présence mémorisée portes fermées",
    ),
    "door_stabilizing": ("door closing confirmation", "confirmation après fermeture"),
    "door_open": ("open door", "porte ouverte"),
    "door_anticipation": ("door opening anticipation", "anticipation à l’ouverture"),
    "context_maintained": ("maintained by context", "maintenue par le contexte"),
    "context_blocked": (
        "context no longer permits presence",
        "contexte de présence terminé",
    ),
    "released": ("release condition matched", "condition de libération satisfaite"),
    "manual_override": ("manual override", "forçage manuel"),
    "missing_source": (
        "insufficient sensor information",
        "informations des capteurs insuffisantes",
    ),
    "reconfirmation_required": (
        "presence needs reconfirmation",
        "présence à reconfirmer",
    ),
    "disabled": ("calculation disabled", "calcul désactivé"),
    "confirming_presence": ("confirming presence", "confirmation de présence"),
    "absence_countdown": ("absence countdown", "temporisation d’absence"),
    "home_rule": ("home rule", "règle de maison"),
    "resident_presence": ("resident location", "localisation du résident"),
    "resident_sleep": ("resident sleep", "sommeil du résident"),
}


@callback
def record(
    hass: HomeAssistant, entity_id: str, value: object, reason: str, context: Context
) -> None:
    fr = hass.config.language.lower().replace("_", "-").startswith("fr")
    detail = REASONS.get(reason, (reason, reason))[int(fr)]
    label = (
        ("présent" if value else "absent")
        if isinstance(value, bool) and fr
        else ("occupied" if value else "clear")
        if isinstance(value, bool)
        else str(value)
        if value is not None
        else ("indéterminé" if fr else "unknown")
    )
    if reason == "resident_sleep" and isinstance(value, bool):
        label = (
            ("endormi" if value else "éveillé")
            if fr
            else ("asleep" if value else "awake")
        )
    message = f"{label} — {detail}"
    hass.bus.async_fire(
        EVENT_DECISION,
        {"name": "Hapo", "message": message, "entity_id": entity_id, "reason": reason},
        context=context,
    )
    hass.bus.async_fire(
        EVENT_LOGBOOK_ENTRY,
        {"name": "Hapo", "message": message, "entity_id": entity_id},
        context=context,
    )
