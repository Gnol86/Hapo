# Replace an existing presence setup

[Français](migration.fr.md)

Hapo provides new result entities and commands. It does not parse and replace arbitrary existing automations automatically.

1. **Inventory and preserve.** Export the current automation, script, scene, dashboard and integration configurations. Record helper states, disabled automation states, exact consumer references and the inverse change for each edit. Read both API configuration and configuration files: neither covers every storage location by itself.
2. **Configure and compare.** Add rooms and residents in Hapo. Keep existing consumers pointed at the old entities while observing Hapo decisions. Investigate differences before switching.
3. **Replace reads and commands.** Update Halo, thermostats, covers, YAML templates, AppDaemon, scenes, groups, dashboards and automations. Use integration options flows and REST/WebSocket APIs rather than editing `.storage`. Adapt triggers to the new entity domain. A binary sensor cannot receive `input_boolean.turn_on`; use Hapo actions or its native controls. `hapo.sleep` also accepts `toggle` for an existing sleep button; an unknown sleep state requires an explicit awake/asleep choice.
4. **Disable replaced calculators.** Disable the old room presence, home mode and sleep-reset automations, preserving their configuration. Their trigger state can be restored with `automation.turn_on`; record any existing `initial_state` or registry disable setting.
5. **Verify before removing.** Search all active consumers for old IDs, verify real states and commands, and only then remove unused helpers. Preserve the exports needed to recreate them. Ignore history, traces and backup copies when checking for active references.

For appliance actions, a recovered `unknown → away` state must not act like a new departure. Restrict the previous state to known occupied modes. Avoid testing consumers by launching a vacuum, moving a cover or changing camera privacy: validate their configuration and conditions first, then observe the normal trigger.

## Analyzed migration patterns

The initial design was derived from thirteen room automations. Their configurable equivalents are:

| Room pattern | Hapo configuration |
| --- | --- |
| Bedroom | Motion/door activity, 60-second absence delay. |
| Hall | Movement/door activity, 10-second absence delay. |
| Upstairs hall | Movement/door activity, no extra absence delay. |
| Laundry | Motion plus opening anticipation, 60 seconds after motion. |
| Kitchen | Movement triggers; radar and door hold only. |
| Cellar | Contact OR activity. |
| Boiler room | Movement OR both relevant doors open. |
| Office, WC, bathroom, gym, garden | Bee with all relevant passages configured. |
| Living room | Local activity, household gate and optional sole-awake resident exclusion. |

The earlier Bee automations used a **20-second motion-on window** and **13-second motion-off window** following door closure. These windows could ignore a genuine late detection. They are not universal rules: Hapo instead uses configurable closure stabilization, confirmed detection at any later time, and explicit open-door behavior. Opening does not necessarily mean a person entered, so anticipation remains opt-in.

A laundry anticipation window may differ from a legacy combination of a 15-second door-close trigger and a 60-second “motion inactive” condition. Confirm the chosen timeout from actual use. Keep resident location confirmation at 20 seconds initially if that is the existing behavior.

Keep alternative office radars as suggestions until explicitly selected. Do not enable new sources merely because they share an area. Each household's private identifiers and migration backups belong outside the public integration repository.
