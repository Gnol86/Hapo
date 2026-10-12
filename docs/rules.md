# Profiles, evidence and home facts

[Français](rules.fr.md)

All six profiles share a trigger condition, optional gate and release conditions, occupancy/absence confirmation delays and manual controls. Sources may use states, scalar attributes or numeric values. AND and OR accept groups; NOT keeps indeterminate evidence indeterminate. Numeric thresholds are strict (`>` / `<`). Hysteresis extends the active range until the value crosses the threshold minus/plus the margin. Boolean attributes use `true` and `false`.

A condition's continuous duration (`for`, in seconds) requires uninterrupted true evidence. An unavailable input breaks continuity. Time ranges use the Home Assistant timezone and can span midnight. Room, home fact and home mode conditions are explicit internal references, so circular dependencies can be rejected. Avoid replacing these with raw Hapo entity IDs.

## Profile behavior

- **Direct / motion / logic:** evaluate the trigger condition and confirm transitions using the occupancy and absence delays. Direct uses a sustained occupancy source, motion uses activity, and logic provides the general condition editor.
- **Separate trigger and hold:** only trigger sources can enter occupancy. Hold sources can prolong an already occupied room; they cannot restart it once clear. The absence countdown starts when neither role can sustain occupancy.
- **Contextual:** a local trigger starts occupancy. Occupancy then remains until a release condition becomes true or the gate becomes false. An uncertain gate or release degrades the result. An explicit inactivity policy can instead be expressed as a timed release condition.
- **Bee in the Box:** all configured door conditions describe their **open** states. Opening any door clears the old latch. When all doors close, a stabilization period starts; confirmed trigger evidence after stabilization creates a latch. A later detection can also create it. Inactivity behind continuously closed doors keeps the latch. An optional maximum duration expires it. While a door is open, normal sensor evidence and the open-door absence delay apply.

The Bee principle is also known as [Wasp in a Box](https://github.com/dlashua/hass-wasp_sensor). Hapo implements its own event-driven state machine. The inference assumes all relevant passages are monitored; it does not establish how many people entered or left.

Opening anticipation and “keep occupied while a door is open” are separate, opt-in settings. Anticipation is based on a real observed opening, never a door already open on startup. It lasts for the larger of the normal and open-door delays (at least one second), unless real trigger evidence takes over. That evidence then uses its own normal absence countdown. Anticipation is not followed by a second duplicate inactivity delay.

## Facts and priority

| Fact | Meaning |
| --- | --- |
| `occupied` | Fresh presence conclusion from the selected home authority, with the explicit guest exception. |
| `present_count` | Known number of configured residents present. |
| `sleeping_count` / `awake_count` | Known counts among present configured residents. |
| `counts_known` | Resident presence and sleep are confirmed and no guests are declared. |
| `guests` | Explicit guest exception. |
| `any_sleeping` / `all_sleeping` | Sleep facts among confirmed present residents. Guests prevent “all sleeping.” |

The home occupancy sensor and mode may temporarily retain their previous values during missing evidence, but dependent rules consume fresh, indeterminate facts, not a fabricated certainty. A retained degraded room result is likewise indeterminate to another room.

For a living room, an optional release condition can combine `counts_known = true`, `awake_count = 1` and “office occupied.” Guests or uncertain counts make this sole-awake-person exclusion inapplicable. A separate gate may require home occupancy and at least one awake resident. If using home modes in such a gate, do not also base those same modes on the living room.

## Persistence and limits

Debounce deadlines and timed overrides are absolute UTC timestamps. A restart rechecks evidence and resumes compatible pending confirmations; it does not reproduce missed events. Continuous-condition timers and numeric hysteresis begin afresh. Door continuity is deliberately not assumed: a previously latched Bee room retains its display temporarily as degraded, then becomes unknown unless reconfirmed. Reopening a monitored door releases that old uncertainty.

These are deterministic rules, not probability estimates or person tracking. Open spaces, pets, unmonitored passages and multiple people can violate closed-box assumptions. Configure the profile according to what the sensors can actually establish.
