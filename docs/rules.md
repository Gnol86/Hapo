# Profiles, evidence and home facts

[Français](rules.fr.md)

All six profiles share a trigger condition, optional gate and release conditions, occupancy/absence confirmation delays and manual controls. Sources may use states, scalar attributes or numeric values. AND and OR accept groups; NOT keeps indeterminate evidence indeterminate. Numeric thresholds are strict (`>` / `<`). Hysteresis extends the active range until the value crosses the threshold minus/plus the margin. Boolean attributes use `true` and `false`.

A condition's continuous duration (`for`, in seconds) requires uninterrupted true evidence. An unavailable input breaks continuity. Time ranges use the Home Assistant timezone and can span midnight. Room, home fact and home mode conditions are explicit internal references, so circular dependencies can be rejected. Avoid replacing these with raw Hapo entity IDs.

## Profile behavior

- **Direct / motion / logic:** evaluate the trigger condition and confirm transitions using the occupancy and absence delays. Direct uses a sustained occupancy source, motion uses activity, and logic provides the general condition editor.
- **Separate trigger and hold:** only trigger sources can enter occupancy. Hold sources can prolong an already occupied room; they cannot restart it once clear. The absence countdown starts when neither role can sustain occupancy.
- **Contextual:** a local trigger starts occupancy. Occupancy then remains until a release condition becomes true or the gate becomes false. An uncertain gate or release degrades the result. An explicit inactivity policy can instead be expressed as a timed release condition.
- **Bee in the Box:** all configured door conditions describe their **open** states. Opening any door clears the old latch. When all doors close, a stabilization period starts; confirmed trigger evidence after stabilization creates a latch. By default, a later detection can also create it without an opening. Inactivity behind continuously closed doors keeps the latch. An optional maximum duration expires it. While a door is open, normal sensor evidence and the open-door absence delay apply.

The Bee principle is also known as [Wasp in a Box](https://github.com/dlashua/hass-wasp_sensor). Hapo implements its own event-driven state machine. The inference assumes all relevant passages are monitored; it does not establish how many people entered or left.

Opening anticipation and “keep occupied while a door is open” are separate, opt-in settings. Anticipation is based on a real observed opening, never a door already open on startup. It lasts for the larger of the normal and open-door delays (at least one second), unless real trigger evidence takes over. That evidence then uses its own normal absence countdown. Anticipation is not followed by a second duplicate inactivity delay.

### Require an opening before new Bee presence

Each Bee room can enable **Require an opening before new presence** (`require_opening`). It is **off by default**, including existing rooms, preserving the behavior above. This is useful for a garden where wind can trigger motion while every monitored access remains closed.

When enabled, motion cannot establish new presence in a clear, closed room until a monitored door opens. An observed open door allows real detections. After the last monitored door closes, the room has its normal stabilization period (`close_delay`), followed by a **Recovery period after stabilization** (`recovery_delay`), **120 seconds by default and configurable separately for each room**. The deadline is fixed at the final closure plus these two durations; detections and interrupted confirmations never extend it. A new opening starts a new entry opportunity.

The three timings have different purposes:

| Setting | Purpose |
| --- | --- |
| Presence confirmation (`on_delay`) | Requires uninterrupted trigger evidence before confirming presence. An interruption restarts this confirmation. |
| Door closing stabilization (`close_delay`) | Prevents retention immediately after the last door closes. It does not require motion throughout stabilization. |
| Recovery period (`recovery_delay`) | Allows late detections and further confirmation attempts after stabilization. A temporary clear result or absence countdown does not consume the remaining period. |

For example, with 20 seconds of stabilization and 120 seconds of recovery, a detection at 60 seconds after closing can retry a failed confirmation without reopening a door. A continuous confirmation that starts before the recovery deadline may finish after it; if the trigger becomes false or unavailable, that attempt is interrupted. Once the deadline passes, no new attempt is accepted until another opening. Choose `on_delay` according to the sensor's actual active duration: a sensor active for only 3 seconds cannot satisfy a 10-second continuous confirmation, regardless of the recovery period.

A confirmed latch consumes the entry opportunity and retains presence during stillness while every door stays closed. Expiry of the optional maximum latch duration (`latch_max`) does not authorize new presence by itself. With the opening requirement enabled, opening anticipation is capped at the recovery deadline after all doors close: it cannot start an artificial confirmation beyond the closure, stabilization and recovery period.

Gate and release conditions, and manual overrides, keep their normal priority. A blocking gate, a matching release condition or an active manual override cancels the temporary entry opportunity. A passage while an override is active does not create an authorization that can be reused when returning to automatic mode with the doors closed. A real Bee latch established before an override can still follow the existing retention rules; resuming automatic mode never fabricates a new entry opportunity. The recovery period does not bypass these priorities.

A restart or lost door continuity invalidates the entry opportunity and recovery deadline. If the doors are known closed afterward, motion alone cannot establish presence: another opening is needed. A door observed open at startup allows real detection, but does not invent an opening event for anticipation. Renaming a room preserves a compatible running recovery deadline. The decision details show whether the room is waiting for an opening or can still recover, and the deadline for new confirmation attempts.

Wind may still be accepted during a recovery period following a real opening. Set the duration to suit each room, and monitor every access to the space.

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

Debounce deadlines and timed overrides are absolute UTC timestamps. A restart rechecks evidence and resumes compatible pending confirmations; it does not reproduce missed events. Continuous-condition timers and numeric hysteresis begin afresh. Bee discards its old latch when door continuity cannot be verified. With the opening requirement disabled, once the monitored doors are known closed, normal closure stabilization applies, followed by the configured absence delay. If the trigger condition is false, the room is treated as clear; there is no indefinite reconfirmation wait. A later confirmed detection can create a new latch without any door opening. With the opening requirement enabled, a closed room instead waits for another opening before accepting new presence, as described above.

An actual unavailable trigger or door still uses the bounded degraded-state policy when the remaining evidence cannot decide. Once sources recover, no confirmation means clear again. Legacy reconfirmation flags stored by 0.1.0 are ignored, including rooms already showing unknown; no configuration change or manual reset is required. Temporary manual overrides retain their normal priority and resume these rules when released.

These are deterministic rules, not probability estimates or person tracking. Open spaces, pets, unmonitored passages and multiple people can violate closed-box assumptions. Configure the profile according to what the sensors can actually establish.
