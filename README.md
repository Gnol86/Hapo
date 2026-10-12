# Hapo — Home Assistant Presence Orchestrator

Room presence, resident sleep and home modes, configured in one place.

English · [Français](docs/README.fr.md) · [Profiles and rules](docs/rules.md) · [Migration](docs/migration.md)

Hapo is a local Home Assistant integration in the Haxo family. Like [Halo](https://github.com/Gnol86/Halo), it includes a sidebar panel with visual configuration. Hapo works independently of Halo and Havo. Its engine keeps running when the panel is closed.

> Early release. Automated tests and an isolated Home Assistant instance cover the scenarios described below. Sensor quality and placement still determine how well an installation can infer presence. Hapo does not identify or count people from motion sensors.

## What it does

| Profile | Use it when |
| --- | --- |
| Direct presence | A radar, seat or bed sensor maintains a reliable occupied state. |
| Timed motion | Motion starts presence; an inactivity delay ends it. |
| Separate trigger and hold | A PIR starts presence; a radar, door or other condition may only keep it active. |
| Bee in the Box | Monitored doors enclose a space where motion should remain remembered during stillness. |
| Logical combination | AND, OR and NOT combine states, attributes, numeric thresholds and time ranges. |
| Contextual presence | Local activity starts presence; household facts or other rooms determine when it may continue or end. |

The panel suggests compatible profiles from Home Assistant areas, device assignments and sensor classes. **Nothing is selected or saved automatically.** A shared door can be used in several rooms.

Each room exposes a native occupancy binary sensor, manual controls, its decision reason and its next deadline. Home devices expose presence, a mode sensor, known resident counts and a guest switch. Residents expose presence, sleep and sleep commands. These entities work with Halo and ordinary Home Assistant automations.

## Install

Requires Home Assistant **2026.10.0 or later**. English and French are included; regional French locales use French, while custom names stay unchanged.

### HACS custom repository

1. In HACS, open **Custom repositories**, add `https://github.com/Gnol86/Hapo`, and choose **Integration**.
2. Download Hapo and restart Home Assistant.
3. Open **Settings → Devices & services → Add integration → Hapo**.
4. Open **Hapo** in the sidebar. Add it once for the whole home.

Distribution through a custom repository does not mean inclusion in the default HACS catalog.

### Manual installation

Copy `custom_components/hapo` into your Home Assistant configuration directory, restart, and add Hapo through Devices & services. The compiled panel is included; Node.js is not needed on Home Assistant.

## Configure

1. **Residents:** choose existing `person`, tracker or other state entities. Specify their home states and confirmation delay. All other known locations, including named zones, mean away. Add an optional automatic sleep condition.
2. **Rooms:** add a room, choose its area and explicitly apply a suggestion or configure sources yourself. Select a profile and adjust the delays. Advanced sections contain doors, context and manual controls.
3. **Home:** choose tracked residents, one external condition, or selected rooms as the presence authority. Configure and order home mode rules.
4. Save the draft. A conflicting revision from another browser blocks overwriting it; export the draft before discarding if you want to preserve both versions.

The default modes have stable keys: `away`, `sleeping`, `quiet`, `active` (French labels: Vide, Dort, Calme, Vie). Rename their labels or add and reorder rules. The first true rule wins. An indeterminate higher-priority rule prevents a potentially incorrect lower-priority result.

With tracked residents as the authority, room activity cannot contradict a confirmed empty home. **Guests** is an explicit exception and makes total person counts uncertain. Counts always refer to tracked residents; occupied rooms are never added together to estimate people.

Manual sleep commands take priority until released or until a confirmed departure. A missing tracker does not clear a sleep override. A mode override changes the displayed mode, not the underlying presence facts.

## Automations and commands

Use the entities shown under **Settings → Devices & services → Hapo**. Room and resident identifiers are also shown under **Details** in the panel. Names can change without changing those identifiers.

```yaml
# Keep a room occupied for 30 minutes, then resume its profile.
action: hapo.room_override
data:
  target_id: office
  value: occupied
  duration: 1800
```

| Action | Values | Additional fields |
| --- | --- | --- |
| `hapo.room_override` | `occupied`, `clear`, `auto` | `target_id`; optional `duration` in seconds |
| `hapo.home_override` | A stable mode key, or `auto` | Optional `duration` in seconds |
| `hapo.sleep` | `sleeping`, `awake`, `auto`, `toggle` | `target_id` of the resident |
| `hapo.guests` | `true`, `false` | — |

Zero duration means until explicitly released. Native select entities offer the same indefinite controls; resume buttons release them. For sleep, departure also releases manual control.

Read the mode sensor's **state key**, not its translated name. Its `mode_name` and `modes` attributes expose custom labels. For a departure-triggered action, use a state transition from a known occupied mode, so an `unknown → away` recovery does not inadvertently start an appliance.

## Reliability and privacy

Conditions use true / false / indeterminate values. Missing entities, `unknown`, `unavailable` and invalid numbers do not become false. If remaining evidence cannot decide, the last result is retained with `degraded: true` for a configurable period (300 seconds initially), then the entity publishes `unknown`.

Configuration, confirmed results, overrides and debounce deadlines persist locally. At startup, evaluation waits for Home Assistant to start. Matching current evidence resumes a pending debounce deadline; changed evidence cancels it. Continuous-duration conditions start fresh. Bee memory must be reconfirmed after a restart or loss of door continuity; Hapo never invents an opening or motion event.

Room and home dependencies are validated as a graph. Cycles are rejected before saving. Updates use state events and scheduled deadlines, with no general polling loop. Native activity entries name Hapo and the affected entity, explain the decision, and preserve the causal context. Exported integration diagnostics omit entity IDs, names, locations and raw state values. **Configuration exports do contain your entity IDs and names.**

Administrators configure Hapo; commands respect Home Assistant entity control permissions. Diagnostic exports are available through the integration's standard diagnostic download.

## Development

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run pytest
npm ci
npm run check
npm test
npm run build
```

Commit the generated `custom_components/hapo/frontend/hapo-panel.js`. CI checks that rebuilding it produces no diff, runs Python and panel tests, and validates the integration with Hassfest. HACS validation is also part of the release workflow. Release versions must match the manifest, Python project, lockfile and `releases/<version>.md`.

See [development notes](docs/development.md) for the engine boundaries and acceptance scenarios. Licensed under MIT. The included panel bundles Lit under its BSD-3-Clause license.
