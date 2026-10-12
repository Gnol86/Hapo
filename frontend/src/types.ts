export interface Condition {
  type: "state" | "numeric" | "and" | "or" | "not" | "room" | "fact" | "home_mode" | "time";
  entity_id?: string; attribute?: string; states?: string[];
  above?: number; below?: number; hysteresis?: number; for?: number;
  conditions?: Condition[]; condition?: Condition; room_id?: string; occupied?: boolean;
  key?: string; op?: string; value?: boolean | number; mode_id?: string; after?: string; before?: string;
}
export type Profile = "direct" | "motion" | "hybrid" | "bee" | "logic" | "contextual";
export interface Room {
  id: string; name: string; area_id: string | null; enabled: boolean; profile: Profile;
  entry: Condition | null; hold: Condition | null; gate: Condition | null; release: Condition | null;
  doors: Condition[]; on_delay: number; off_delay: number; open_delay: number; close_delay: number;
  anticipate: boolean; keep_open: boolean; latch_max: number;
}
export interface Resident {
  id: string; name: string; entity_id: string; home_states: string[]; presence_delay: number; sleep_source: Condition | null;
}
export interface Mode { id: string; name: string; condition: Condition }
export interface Config {
  version: 1; failure_grace: number; rooms: Record<string, Room>; residents: Record<string, Resident>;
  home: { source: "residents" | "entity" | "rooms"; entity: Condition | null; rooms: string[]; modes: Mode[] };
}
export interface EntityOption {
  entity_id: string; name: string; state: string; area_id?: string; device_class?: string;
  unit?: string; device_id?: string; attributes?: Record<string, string | number | boolean>;
}
export interface RuntimeRoom {
  occupied: boolean | null; reason: string; degraded: boolean; pending: boolean; latched: boolean;
  evidence: string[]; next_deadline: number | null; override: { occupied: boolean; until: number | null } | null;
}
export interface RuntimeResident { present: boolean | null; sleeping: boolean | null; manual_sleep: boolean; degraded: boolean; pending: boolean }
export interface RuntimeHome { occupied?: boolean | null; mode?: string | null; present_count?: number | null; awake_count?: number | null; sleeping_count?: number | null; guests?: boolean; degraded?: boolean; counts_known?: boolean; override?: { mode: string; until: number | null } | null; next_deadline?: number | null }
export interface Suggestion { profile: Profile; reason: string; entry: string[]; hold: string[]; doors: string[] }
export interface Snapshot {
  revision: number; admin: boolean; config?: Config; instance_id?: string;
  names: { rooms: Record<string, string>; residents: Record<string, string>; modes?: Record<string, string> };
  runtime: { rooms: Record<string, RuntimeRoom>; residents: Record<string, RuntimeResident>; home: RuntimeHome; next_deadline: number | null };
  catalog?: { areas: { area_id: string; name: string }[]; entities: EntityOption[] };
  suggestions?: Record<string, Suggestion[]>;
}
export interface Hass {
  user?: { id: string };
  language?: string; locale?: { language: string }; themes?: { darkMode: boolean };
  states: Record<string, { state: string; attributes: Record<string, unknown> }>;
  callWS<T = Snapshot>(message: Record<string, unknown>): Promise<T>;
  connection: { subscribeMessage(callback: (data: Snapshot) => void, message: Record<string, unknown>): Promise<() => void> };
}
