const condition = (entity_id, states = ["on"]) => ({ type: "state", entity_id, states });
const copy = (value) => structuredClone(value);

/** Fictional, deterministic snapshot. No live entity names or user information. */
export function createSnapshot(language = "en") {
  const fr = language === "fr";
  const rooms = [
    ["office", "Bureau", "Office", "bee", true, "closed_box"],
    ["living_room", "Salon", "Living room", "hybrid", true, "holding_source"],
    ["kitchen", "Cuisine", "Kitchen", "motion", false, "no_activity"],
    ["bedroom", "Chambre", "Bedroom", "bee", false, "no_activity"],
    ["bathroom", "Salle de bain", "Bathroom", "hybrid", false, "no_activity"],
    ["hallway", "Hall d’entrée", "Hallway", "motion", false, "no_activity"],
    ["garden", "Jardin", "Garden", "bee", false, "waiting_for_opening"],
    ["laundry", "Buanderie", "Laundry room", "motion", false, "no_activity"],
    ["garage", "Garage", "Garage", "direct", false, "no_activity"],
  ];
  const entities = [];
  const configRooms = {};
  const runtimeRooms = {};
  const names = {};
  const areas = [];
  const suggestions = {};
  for (const [id, french, english, profile, occupied, reason] of rooms) {
    const name = fr ? french : english;
    const motion = `binary_sensor.${id}_motion`;
    const door = `binary_sensor.${id}_door`;
    const presence = `binary_sensor.${id}_presence`;
    names[id] = name;
    areas.push({ area_id: id, name });
    configRooms[id] = {
      id, name, area_id: id, enabled: true, profile,
      entry: condition(motion), hold: profile === "hybrid" ? condition(presence) : null,
      gate: null, release: null, doors: profile === "bee" ? [condition(door)] : [],
      on_delay: id === "garden" ? 2 : 0, off_delay: id === "hallway" ? 30 : 60,
      open_delay: 60, close_delay: 20, anticipate: false, keep_open: false,
      latch_max: 0, require_opening: ["garden", "office"].includes(id), recovery_delay: 120,
    };
    runtimeRooms[id] = {
      occupied, reason, degraded: false, pending: false, latched: id === "office",
      evidence: occupied ? [id === "living_room" ? presence : motion] : [],
      next_deadline: null, override: null, recovery_until: null,
    };
    entities.push({
      entity_id: motion, name: `${name} · ${fr ? "Mouvement" : "Motion"}`,
      state: id === "living_room" ? "on" : "off", area_id: id, device_class: "motion",
    });
    if (profile === "bee") entities.push({
      entity_id: door, name: `${name} · ${fr ? "Porte" : "Door"}`, state: "off",
      area_id: id, device_class: "door",
    });
    if (profile === "hybrid") entities.push({
      entity_id: presence, name: `${name} · ${fr ? "Présence" : "Presence"}`,
      state: occupied ? "on" : "off", area_id: id, device_class: "occupancy",
    });
    suggestions[id] = [{
      profile, reason: profile === "bee" ? "motion_and_doors" : profile === "hybrid" ? "motion_and_occupancy" : "motion_available",
      entry: [motion], hold: profile === "hybrid" ? [presence] : [], doors: profile === "bee" ? [door] : [],
    }];
  }
  entities.push(
    { entity_id: "person.alex", name: "Alex", state: "home" },
    { entity_id: "person.camille", name: "Camille", state: "home" },
    { entity_id: "input_boolean.night_mode", name: fr ? "Mode nuit" : "Night mode", state: "off" },
    { entity_id: "sensor.bathroom_humidity", name: fr ? "Salle de bain · Humidité" : "Bathroom · Humidity", state: "47", unit: "%", area_id: "bathroom", device_class: "humidity" },
  );
  const modes = [
    { id: "away", name: fr ? "Absent" : "Away", condition: { type: "fact", key: "occupied", op: "eq", value: false } },
    { id: "night", name: fr ? "Nuit" : "Night", condition: condition("input_boolean.night_mode") },
    { id: "active", name: fr ? "À la maison" : "At home", condition: { type: "fact", key: "occupied", op: "eq", value: true } },
  ];
  return {
    revision: 1, admin: true, instance_id: `hapo-local-preview-${language}`,
    config: {
      version: 1, failure_grace: 60, rooms: configRooms,
      residents: Object.fromEntries(["alex", "camille"].map((id) => [id, {
        id, name: id === "alex" ? "Alex" : "Camille", entity_id: `person.${id}`,
        home_states: ["home"], presence_delay: 20, sleep_source: null,
      }])),
      home: { source: "residents", entity: null, rooms: [], modes },
    },
    names: { rooms: names, residents: { alex: "Alex", camille: "Camille" }, modes: Object.fromEntries(modes.map((mode) => [mode.id, mode.name])) },
    runtime: {
      rooms: runtimeRooms,
      residents: Object.fromEntries(["alex", "camille"].map((id) => [id, { present: true, sleeping: false, manual_sleep: false, degraded: false, pending: false }])),
      home: { occupied: true, mode: "active", present_count: 2, awake_count: 2, sleeping_count: 0, guests: false, degraded: false, counts_known: true, override: null, next_deadline: null },
      next_deadline: null,
    },
    catalog: { areas, entities }, suggestions,
  };
}

/** UI mock only; validation and commands deliberately do not run the presence engine. */
export function createMockHass(language = "en", darkMode = true) {
  let snapshot = createSnapshot(language);
  const initial = copy(snapshot);
  const subscribers = new Set();
  const publish = () => { for (const callback of subscribers) callback(copy(snapshot)); };
  const invalid = (code) => { throw Object.assign(new Error(code), { code }); };
  const validate = (config) => {
    if (!config || config.version !== 1 || !config.rooms || !config.residents || !config.home) invalid("invalid_config");
    for (const room of Object.values(config.rooms)) {
      if (!room.id || !Array.isArray(room.doors) || !["direct", "motion", "hybrid", "bee", "logic", "contextual"].includes(room.profile)) invalid("invalid_config");
      for (const key of ["on_delay", "off_delay", "open_delay", "close_delay", "latch_max", "recovery_delay"]) {
        if (!Number.isInteger(room[key]) || room[key] < 0 || room[key] > 604800) invalid("invalid_config");
      }
    }
    return copy(config);
  };
  const hass = {
    user: { id: "preview-user", name: "Preview", is_admin: true }, language,
    locale: { language }, themes: { darkMode }, narrow: false, dockedSidebar: "always_hidden",
    states: Object.fromEntries(snapshot.catalog.entities.map((entity) => [entity.entity_id, {
      entity_id: entity.entity_id, state: entity.state, attributes: { friendly_name: entity.name, device_class: entity.device_class, unit_of_measurement: entity.unit },
    }])),
    async callWS(message) {
      switch (message.type) {
        case "hapo/get": return copy(snapshot);
        case "hapo/validate": return { config: validate(message.config) };
        case "hapo/save": {
          if (message.revision !== snapshot.revision) invalid("conflict");
          snapshot.config = validate(message.config);
          snapshot.revision += 1;
          for (const collection of ["rooms", "residents"]) {
            snapshot.names[collection] = Object.fromEntries(Object.entries(snapshot.config[collection]).map(([key, value]) => [key, value.name || key]));
            for (const key of Object.keys(snapshot.runtime[collection])) {
              if (!(key in snapshot.config[collection])) delete snapshot.runtime[collection][key];
            }
          }
          snapshot.names.modes = Object.fromEntries(snapshot.config.home.modes.map((mode) => [mode.id, mode.name]));
          publish();
          return copy(snapshot);
        }
        case "hapo/command": {
          const { command, target, value, duration = 0 } = message;
          const until = duration > 0 ? Date.now() / 1000 + duration : null;
          if (command === "room_override" && snapshot.runtime.rooms[target]) {
            const room = snapshot.runtime.rooms[target];
            if (value === "auto") Object.assign(room, copy(initial.runtime.rooms[target]));
            else {
              room.occupied = value === "occupied";
              room.override = { occupied: room.occupied, until };
              room.reason = "manual_override";
            }
          } else if (command === "sleep" && snapshot.runtime.residents[target]) {
            const resident = snapshot.runtime.residents[target];
            resident.sleeping = value === "sleeping";
            resident.manual_sleep = value !== "auto";
            snapshot.runtime.home.sleeping_count = Object.values(snapshot.runtime.residents).filter((person) => person.sleeping).length;
            snapshot.runtime.home.awake_count = snapshot.runtime.home.present_count - snapshot.runtime.home.sleeping_count;
          } else if (command === "guests") snapshot.runtime.home.guests = Boolean(value);
          else if (command === "home_override") {
            snapshot.runtime.home.mode = value === "auto" ? "active" : value;
            snapshot.runtime.home.override = value === "auto" ? null : { mode: value, until };
          } else invalid("invalid_command");
          publish();
          return copy(snapshot);
        }
        default: invalid("unsupported_preview_request");
      }
    },
    connection: {
      async subscribeMessage(callback, message) {
        if (message.type !== "hapo/subscribe") invalid("unsupported_preview_request");
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    },
  };
  return { hass, getSnapshot: () => copy(snapshot) };
}
