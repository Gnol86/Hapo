# Implementation and verification

- `models.py` owns defaults, configuration validation and topological dependency ordering.
- `conditions.py` and `engine.py` are deterministic calculations without Home Assistant I/O. Pass explicit timestamps and source snapshots; deadlines are returned to the caller.
- `manager.py` owns event subscriptions, the next timer, revision checks, authorization, native activity and atomic local storage.
- Entity platforms expose stable logical devices and reconcile additions/removals without restarting the integration.
- `websocket.py` and `services.py` are the authenticated panel and public action interfaces. Administrative configuration is separate from permitted entity commands.
- `frontend/src` contains Lit components, the recursive condition editor, metadata suggestions and locale dictionaries. Drafts survive live updates and panel navigation; when a signed-in user and integration ID are available, session storage also preserves a draft when leaving and reopening the panel in the same browser tab. Browser storage failure does not prevent editing.

The tests cover profiles, retriggers, multiple doors, stillness, late detections, closure stabilization, open-door behavior, maximum latch duration, short unconfirmed motion, hold-only sources, timeouts, numeric hysteresis, unknown inputs, resident confirmations, named zones, sleep overrides, guest exceptions, custom mode priority, cycles, deadlines after restart, entity lifecycle, commands, permissions, revision conflicts, native activity and redacted diagnostics. Panel tests exercise draft retention, explicit suggestion selection, validation, concurrent saves, localization and subscription cleanup.

Bee regression scenarios cover a startup motion pulse ending during stabilization, clearing without further state events, late motion reactivating the room, old persisted reconfirmation flags, manual resume, and recovery from brief or prolonged door outages. Missing live sources still exercise the three-valued failure policy.

The optional Bee opening requirement adds fixed per-entry recovery deadlines, with 120 seconds as the per-room default. Coverage includes blocked motion without an opening, late and interrupted confirmations, a continuous attempt finishing after the deadline, multiple doors, stillness after latching, maximum latch expiry, restart and door outages, and compatibility when the option is disabled. Panel tests cover conditional controls, per-room save persistence, old room defaults and translated recovery details. Keep the continuous trigger confirmation, door stabilization and recovery period distinct in labels and explanations.

Pure engine replay is useful for historical comparisons. Evaluate every scheduled deadline before the next recorded state event, and inject manual sleep actions separately from location state changes. Recorder history alone cannot prove unrecorded sensor continuity.

For manual verification, use a separate Home Assistant configuration directory, bind HTTP to localhost, install this component and configure simulated input entities. Test actual configuration flows, websocket saves, services, generated entities and the native sidebar panel. Verify narrow/wide layouts and both themes. Household installation and physical behavior remain a separate validation stage.

Configuration lives in Home Assistant's versioned Store and includes runtime timestamps. Diagnostics are intentionally compact and redacted; configuration exports are not anonymized. Do not commit real household captures or credentials. Repository `tmp/` is ignored.
