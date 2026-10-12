import type { Condition, Config, Profile, Resident, Room, Suggestion } from "./types";

export const profiles: Profile[] = ["direct", "motion", "hybrid", "bee", "logic", "contextual"];
export function createId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
export function room(id: string, area_id: string | null = null): Room {
  return { id, name: "", area_id, enabled: true, profile: "motion", entry: null, hold: null, gate: null, release: null,
    doors: [], on_delay: 0, off_delay: 60, open_delay: 60, close_delay: 20, anticipate: false, keep_open: false, latch_max: 0 };
}
export function resident(id: string): Resident {
  return { id, name: "", entity_id: "", home_states: ["home"], presence_delay: 20, sleep_source: null };
}
export function stateCondition(id: string): Condition { return { type: "state", entity_id: id, states: ["on"] }; }
export function anySource(ids: string[]): Condition | null {
  return ids.length === 0 ? null : ids.length === 1 ? stateCondition(ids[0]) : { type: "or", conditions: ids.map(stateCondition) };
}
export function applySuggestion(current: Room, choice: Suggestion): Room {
  return { ...structuredClone(current), profile: choice.profile, entry: anySource(choice.entry), hold: anySource(choice.hold), doors: choice.doors.map(stateCondition) };
}
export function defaultCondition(type: Condition["type"]): Condition {
  if (type === "and" || type === "or") return { type, conditions: [stateCondition("")] };
  if (type === "not") return { type, condition: stateCondition("") };
  if (type === "numeric") return { type, entity_id: "", above: 0, hysteresis: 0 };
  if (type === "room") return { type, room_id: "", occupied: true };
  if (type === "fact") return { type, key: "occupied", op: "eq", value: true };
  if (type === "home_mode") return { type, mode_id: "active" };
  if (type === "time") return { type, after: "08:00", before: "22:00" };
  return stateCondition("");
}
export function exportConfig(config: Config): string { return JSON.stringify(config, null, 2); }
export function parseImport(text: string): Config {
  const value = JSON.parse(text);
  if (!value || value.version !== 1 || !value.rooms || !value.residents || !value.home) throw new Error("invalid_config");
  return value as Config;
}
