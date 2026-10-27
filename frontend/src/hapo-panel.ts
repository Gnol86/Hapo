import { LitElement, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { panelStyles } from "./styles";
import { translate } from "./translations";
import { applySuggestion, createId, defaultCondition, exportConfig, parseImport, profiles, resident, room } from "./model";
import type { Condition, Config, Hass, Room, Snapshot } from "./types";
import type { HapoCondition } from "./condition-editor";
import "./condition-editor";
import "./entity-picker";

type View = "overview" | "rooms" | "residents" | "home";
type RoomSection = "presence" | "detection" | "timing" | "context" | "settings";
const roomSections: RoomSection[] = ["presence", "detection", "timing", "context", "settings"];
export class HapoPanel extends LitElement {
  static properties = { hass: { attribute: false }, narrow: { type: Boolean }, snapshot: { state: true }, draft: { state: true }, view: { state: true }, roomSection: { state: true }, selectedRoom: { state: true }, selectedResident: { state: true }, error: { state: true }, saving: { state: true }, message: { state: true }, query: { state: true }, residentQuery: { state: true }, overrideMinutes: { state: true } };
  static styles = panelStyles;
  hass?: Hass;
  narrow = false;
  snapshot?: Snapshot;
  draft?: Config;
  private baseRevision = 0;
  private view: View = "rooms";
  private roomSection: RoomSection = "presence";
  private selectedRoom = "";
  private selectedResident = "";
  private error = "";
  private message = "";
  private saving = false;
  private query = "";
  private residentQuery = "";
  private overrideMinutes = 60;
  private selectedMode = "auto";
  private unsubscribe?: () => void;
  private generation = 0;
  private editorEpoch = 0;
  private messageTimer?: ReturnType<typeof setTimeout>;
  private connecting = false;
  private beforeUnload = (event: BeforeUnloadEvent) => { if (this.draft) { event.preventDefault(); event.returnValue = ""; } };
  private get locale() { return this.hass?.locale?.language ?? this.hass?.language ?? "en"; }
  private t(key: string) { return translate(key, this.locale); }
  private get config() { return this.draft ?? this.snapshot?.config; }
  private get entities() { return this.snapshot?.catalog?.entities ?? []; }
  private get admin() { return this.snapshot?.admin ?? false; }
  private get conflict() { return !!this.draft && this.baseRevision !== this.snapshot?.revision; }

  connectedCallback() { super.connectedCallback(); window.addEventListener("beforeunload", this.beforeUnload); if (this.hass) void this.connect(); }
  disconnectedCallback() { this.generation++; this.unsubscribe?.(); this.unsubscribe = undefined; this.connecting = false; if (this.messageTimer) clearTimeout(this.messageTimer); window.removeEventListener("beforeunload", this.beforeUnload); super.disconnectedCallback(); }
  protected updated(changed: PropertyValues) {
    for (const select of this.renderRoot.querySelectorAll<HTMLSelectElement>("select[data-selected]")) {
      if (select.value !== select.dataset.selected) select.value = select.dataset.selected ?? "";
    }
    if (changed.has("hass")) {
      const old = changed.get("hass") as Hass | undefined;
      if (old?.connection && old.connection !== this.hass?.connection) { this.generation++; this.unsubscribe?.(); this.unsubscribe = undefined; this.connecting = false; }
      if (this.hass && !this.unsubscribe && !this.connecting) void this.connect();
      if (this.hass?.themes?.darkMode !== undefined) this.style.colorScheme = this.hass.themes.darkMode ? "dark" : "light";
    }
  }
  private async connect() {
    if (!this.hass || this.connecting) return;
    const generation = ++this.generation;
    this.connecting = true;
    try {
      const initial = await this.hass.callWS<Snapshot>({ type: "hapo/get" });
      if (generation !== this.generation) return;
      this.acceptSnapshot(initial);
      const unsubscribe = await this.hass.connection.subscribeMessage(data => { if (generation === this.generation) this.acceptSnapshot(data); }, { type: "hapo/subscribe" });
      if (generation === this.generation && this.isConnected) this.unsubscribe = unsubscribe; else unsubscribe();
    } catch (error) { if (generation === this.generation) this.showError(error); }
    finally { if (generation === this.generation) this.connecting = false; }
  }
  private get draftKey() { return this.hass?.user?.id && this.snapshot?.instance_id ? `hapo.draft.${this.snapshot.instance_id}.${this.hass.user.id}` : null; }
  private rememberDraft() { try { if (this.draftKey) { if (this.draft) sessionStorage.setItem(this.draftKey, JSON.stringify({ config: this.draft, revision: this.baseRevision })); else sessionStorage.removeItem(this.draftKey); } } catch { /* Keep the in-memory draft if browser storage is unavailable. */ } }
  acceptSnapshot(snapshot: Snapshot) {
    const first = !this.snapshot; this.snapshot = snapshot;
    if (!snapshot.admin) { this.view = "overview"; this.draft = undefined; }
    if (first && snapshot.admin && this.draftKey) {
      try { const saved = sessionStorage.getItem(this.draftKey); if (saved) { const value = JSON.parse(saved); this.draft = parseImport(JSON.stringify(value.config)); this.baseRevision = value.revision; } } catch { /* Ignore an invalid saved browser draft. */ }
    }
  }
  private showError(error: unknown) { const e = error as { code?: string; message?: string }; this.error = this.t(e.code ?? e.message ?? "error"); }
  private change(update: (config: Config) => void) {
    if (!this.config || !this.admin) return;
    if (!this.draft) { this.baseRevision = this.snapshot!.revision; this.draft = structuredClone(this.config); }
    update(this.draft); this.rememberDraft(); this.error = ""; this.message = ""; this.requestUpdate();
  }
  private hasConfiguredDoor(r: Room) {
    return r.doors.some(d => d.type === "state" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(d.entity_id ?? "")
      && d.states?.length && d.states.every(state => state.trim() && !["unknown", "unavailable"].includes(state)));
  }
  private patchRoom(change: Partial<Room>) {
    this.change(c => {
      const r = Object.assign(c.rooms[this.selectedRoom], change);
      if (change.doors && !this.hasConfiguredDoor(r)) r.anticipate = r.keep_open = r.require_opening = false;
    });
  }
  private valid(): boolean {
    let valid = true;
    for (const input of this.renderRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement | HapoCondition>("input,select,hapo-condition,hapo-entity-picker")) {
      if (!input.reportValidity()) { valid = false; let parent = input.parentElement; while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; } }
    }
    if (!valid) this.error = this.t("invalid");
    return valid;
  }
  private navigate(view: View, key = "") {
    if (this.saving || !this.valid()) return;
    this.view = view;
    if (view === "rooms") { if (this.selectedRoom !== key) this.roomSection = "presence"; this.selectedRoom = key; }
    if (view === "residents") this.selectedResident = key;
    this.error = "";
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(key ? ".view-title" : ".rail-heading h2")?.focus());
  }
  private selectRoomSection(section: RoomSection) {
    if (this.saving || !this.valid()) return false;
    this.roomSection = section; this.error = ""; return true;
  }
  private roomTabKey(event: KeyboardEvent, section: RoomSection) {
    const index = roomSections.indexOf(section);
    const next = event.key === "Home" ? 0 : event.key === "End" ? roomSections.length - 1
      : event.key === "ArrowRight" ? (index + 1) % roomSections.length : event.key === "ArrowLeft" ? (index + roomSections.length - 1) % roomSections.length : -1;
    if (next < 0) return;
    event.preventDefault();
    if (this.selectRoomSection(roomSections[next])) void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(`#room-tab-${roomSections[next]}`)?.focus());
  }
  private async save() {
    if (!this.hass || !this.draft || !this.valid() || this.saving) return;
    const missingDoors = Object.values(this.draft.rooms).find(r => !this.hasConfiguredDoor(r)
      && (r.anticipate || r.keep_open || (r.profile === "bee" && r.require_opening)));
    if (missingDoors) {
      this.view = "rooms"; this.selectedRoom = missingDoors.id; this.roomSection = "detection";
      this.error = `${this.roomName(missingDoors.id)} : ${this.t("doorOptionsHelp")}`;
      return;
    }
    this.saving = true; this.error = "";
    try {
      const result = await this.hass.callWS<Snapshot>({ type: "hapo/save", config: this.draft, revision: this.baseRevision });
      this.snapshot = result; this.draft = undefined; this.rememberDraft(); this.message = this.t("saved");
      this.messageTimer = setTimeout(() => { this.message = ""; }, 4000);
    } catch (error) { this.showError(error); }
    finally { this.saving = false; }
  }
  private discard() { this.draft = undefined; this.rememberDraft(); this.error = ""; this.editorEpoch++; this.requestUpdate(); }
  private async command(command: string, target: string, value: string | boolean, duration = 0) {
    if (!this.hass) return;
    try { this.acceptSnapshot(await this.hass.callWS<Snapshot>({ type: "hapo/command", command, target, value, duration })); this.error = ""; }
    catch (error) { this.showError(error); }
  }
  private status(value?: boolean | null) { return html`<span class="status" data-state=${value == null ? "unknown" : value ? "on" : "off"}><span class="dot"></span>${this.t(value == null ? "unknown" : value ? "occupied" : "clear")}</span>`; }
  private modeName(key?: string | null) { return key ? this.config?.home.modes.find(m => m.id === key)?.name || this.snapshot?.names.modes?.[key] || this.t(key) : this.t("unknown"); }
  private roomName(key: string) { const r = this.config?.rooms[key]; return r?.name || this.snapshot?.catalog?.areas.find(a => a.area_id === r?.area_id)?.name || this.snapshot?.names.rooms[key] || key; }
  private residentName(key: string) { const r = this.config?.residents[key]; return r?.name || this.entities.find(e => e.entity_id === r?.entity_id)?.name || this.snapshot?.names.residents[key] || key; }
  private text(label: string, value: string, update: (v: string) => void, required = false, onChange = false) { return html`<label>${this.t(label)}<input .value=${value} ?required=${required} @input=${(e: Event) => { if (!onChange) update((e.target as HTMLInputElement).value); }} @change=${(e: Event) => { if (onChange) update((e.target as HTMLInputElement).value); }}></label>`; }
  private number(label: string, value: number, update: (v: number) => void, max = 604800) { return html`<label>${this.t(label)}<input type="number" min="0" max=${max} step="1" required .value=${String(value)} @input=${(e: Event) => { const field = e.target as HTMLInputElement; if (field.validity.valid) update(field.valueAsNumber); }}></label>`; }
  private check(label: string, value: boolean, update: (v: boolean) => void, disabled = false, describedBy?: string) { return html`<label class="check"><input type="checkbox" .checked=${value} ?disabled=${disabled} aria-describedby=${describedBy ?? nothing} @change=${(e: Event) => { if (!disabled) update((e.target as HTMLInputElement).checked); }}>${this.t(label)}</label>`; }
  private condition(label: string, value: Condition | null, update: (v: Condition | null) => void, optional = true, externalOnly = false, stateOnly = false) { return html`<hapo-condition .label=${this.t(label)} .value=${value} .config=${this.config} .entities=${this.entities} .locale=${this.locale} .optional=${optional} .externalOnly=${externalOnly} .stateOnly=${stateOnly} @condition-changed=${(e: CustomEvent) => { e.stopPropagation(); update(e.detail.value); }}></hapo-condition>`; }
  private download() {
    if (!this.config) return;
    const url = URL.createObjectURL(new Blob([exportConfig(this.config)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "hapo-configuration.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private async importFile(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try { if (file.size > 1024 * 1024) throw new Error("invalid_config"); const parsed = parseImport(await file.text()); const { config } = await this.hass!.callWS<{ config: Config }>({ type: "hapo/validate", config: parsed }); this.change(c => { for (const key of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[key]; Object.assign(c, config); }); this.editorEpoch++; }
    catch (error) { this.showError(error); }
    input.value = "";
  }
  render() {
    const showSidebarButton = (this.narrow || this.hass?.dockedSidebar === "always_hidden")
      && !this.hass?.kioskMode && this.hass?.auth?.external?.config?.hasSidebar !== true;
    const views: View[] = this.admin ? ["rooms", "residents", "home"] : ["overview"];
    return html`<header class="app-header"><div class="brand" title=${this.t("subtitle")}>
        ${showSidebarButton ? html`<button class="icon-button sidebar-toggle" aria-label=${this.t("menu")} title=${this.t("menu")}
          @click=${() => this.dispatchEvent(new CustomEvent("hass-toggle-menu", { detail: { open: true }, bubbles: true, composed: true }))}><ha-icon icon="mdi:menu" aria-hidden="true"></ha-icon></button>` : nothing}
        <ha-icon icon="mdi:home-account" aria-hidden="true"></ha-icon><h1>Hapo</h1><span class="sr-only">${this.t("subtitle")}</span></div>
      <nav class="top-nav" aria-label="Hapo">${views.map(view => html`<button aria-current=${this.view === view ? "page" : nothing} ?disabled=${this.saving}
        @click=${() => this.navigate(view)}>${this.t(view === "home" ? "globalSettings" : view)}</button>`)}</nav></header>
      <div class="content"><main lang=${this.locale} ?inert=${this.saving}>
        ${this.error ? html`<div role="alert" class="notice error"><ha-icon icon="mdi:alert-circle-outline" aria-hidden="true"></ha-icon><span class="grow">${this.error}</span></div>` : nothing}
        ${this.conflict ? html`<div role="alert" class="notice">${this.t("conflict")}</div>` : nothing}
        ${this.message ? html`<div role="status" class="notice">${this.message}</div>` : nothing}
        ${!this.snapshot ? html`<div class="empty-state"><p role="status">${this.t("loading")}</p>${this.error ? html`<button @click=${() => this.connect()}>${this.t("retry")}</button>` : nothing}</div>`
          : keyed(this.editorEpoch, this.view === "overview" ? html`<div class="overview">${this.overview()}</div>` : this.view === "rooms" ? this.rooms() : this.view === "residents" ? this.residents() : this.home())}
      </main></div>
      ${this.draft ? html`<footer class="savebar" role="status"><span class="grow">${this.t("draft")}</span><button ?disabled=${this.saving} @click=${() => this.discard()}>${this.t("discard")}</button><button class="primary" ?disabled=${this.saving || this.conflict} @click=${() => this.save()}>${this.t(this.saving ? "saving" : "save")}</button></footer>` : nothing}`;
  }
  private homeSummary() {
    const home = this.snapshot!.runtime.home;
    return html`<section class="home-banner"><div><small>${this.t("home")}</small><div class="home-mode">${this.modeName(home.mode)}</div>${home.degraded ? html`<small>${this.t("degraded")}</small>` : nothing}</div><div class="numbers">${["present_count", "awake_count", "sleeping_count"].map(key => html`<div><span class="number">${home[key as "present_count"] ?? "—"}</span><small>${this.t(key)}</small></div>`)}</div>${this.check("guests", home.guests ?? false, value => void this.command("guests", "", value))}</section>`;
  }
  private overview() {
    return html`${this.homeSummary()}
      <div class="toolbar"><h2>${this.t("rooms")}</h2>${this.admin ? html`<button @click=${() => this.addRoom()}>+ ${this.t("addRoom")}</button>` : nothing}</div>
      ${Object.keys(this.snapshot!.runtime.rooms).length ? html`<div class="grid">${Object.entries(this.snapshot!.runtime.rooms).map(([key, result]) => html`<article class="card"><div class="card-top"><button class="title" ?disabled=${!this.admin} @click=${() => this.navigate("rooms", key)}>${this.roomName(key)}</button>${this.status(result.occupied)}</div><p class="hint">${this.t(result.reason)}</p>${result.next_deadline ? html`<small class="readout">${this.t("next")} · ${new Date(result.next_deadline * 1000).toLocaleTimeString(this.locale)}</small>` : nothing}<div class="actions"><button class="link" @click=${() => this.command("room_override", key, "auto")}>${this.t("resume")}</button></div></article>`)}</div>` : html`<div class="empty"><p>${this.t("emptyRooms")}</p></div>`}
      <h2 class="section">${this.t("residents")}</h2><div class="grid">${Object.entries(this.snapshot!.runtime.residents).map(([key, r]) => html`<article class="card"><div class="card-top"><h3>${this.residentName(key)}</h3><small>${this.t(r.present == null ? "unknown" : r.present ? "present" : "absent")}</small></div><p>${this.t(r.sleeping == null ? "unknown" : r.sleeping ? "sleeping" : "awake")}</p><div class="actions"><button @click=${() => this.command("sleep", key, "sleeping")}>${this.t("sleep")}</button><button @click=${() => this.command("sleep", key, "awake")}>${this.t("wake")}</button></div></article>`)}</div>`;
  }
  private addRoom(areaId: string | null = null) {
    if (!this.valid()) return;
    const id = createId(); this.change(c => { c.rooms[id] = room(id, areaId); });
    this.view = "rooms"; this.selectedRoom = id; this.roomSection = areaId ? "detection" : "settings";
  }
  private roomItems() {
    const configured = Object.keys(this.config?.rooms ?? {}).map(key => ({ key, name: this.roomName(key), areaId: this.config!.rooms[key].area_id, configured: true }));
    const assigned = new Set(configured.map(item => item.areaId));
    return [...configured, ...(this.snapshot?.catalog?.areas ?? []).filter(area => !assigned.has(area.area_id)).map(area => ({ key: `area:${area.area_id}`, name: area.name, areaId: area.area_id, configured: false }))];
  }
  private rooms() {
    if (!this.config) return nothing;
    const items = this.roomItems();
    const selected = items.find(item => item.key === this.selectedRoom);
    const current = this.config.rooms[this.selectedRoom];
    const filtered = items.filter(item => item.name.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()));
    return html`<div class="workspace ${selected ? "has-selection" : ""}">
      <aside class="room-rail" aria-label=${this.t("rooms")}><div class="rail-heading"><h2 tabindex="-1">${this.t("rooms")}</h2><span class="count">${items.length}</span></div>
        <label class="rail-search"><span>${this.t("search")}</span><input type="search" .value=${this.query} @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }}></label>
        <div class="room-list">${filtered.map(item => {
          const result = this.snapshot!.runtime.rooms[item.key];
          const r = this.config!.rooms[item.key];
          return html`<div class="room-item" ?data-active=${item.key === this.selectedRoom} data-state=${result?.occupied == null ? "unknown" : result.occupied ? "on" : "off"}>
            <button class="room-link" aria-label=${item.name} aria-current=${item.key === this.selectedRoom ? "page" : nothing} @click=${() => this.navigate("rooms", item.key)}>
              <ha-icon icon=${!r ? "mdi:plus-circle-outline" : result?.occupied ? "mdi:account" : "mdi:account-outline"} aria-hidden="true"></ha-icon>
              <span><strong>${item.name}</strong><small class="room-meta">${r ? `${this.t(r.profile)} · ${this.t(!r.enabled ? "disabled" : result?.occupied == null ? "unknown" : result.occupied ? "occupied" : "clear")}` : this.t("unconfigured")}</small></span>
            </button>
            ${r ? html`<button class="icon-button quick-toggle" aria-label=${`${this.t("resume")} · ${item.name}`} title=${this.t("resume")} ?disabled=${!result?.override} @click=${() => this.command("room_override", item.key, "auto")}><ha-icon icon="mdi:restore" aria-hidden="true"></ha-icon></button>` : nothing}
          </div>`;
        })}</div>
        ${!filtered.length ? html`<p class="empty">${this.t(items.length ? "noRoomsMatch" : "emptyRooms")}</p>` : nothing}
        <button class="link rail-add" @click=${() => this.addRoom()}><ha-icon icon="mdi:plus" aria-hidden="true"></ha-icon>${this.t("addRoom")}</button>
      </aside>
      <section class="room-detail ${selected ? "" : "empty-detail"}">
        ${current ? this.roomEditor(current) : selected ? html`${this.detailHeading(selected.name, "rooms")}<div class="empty-state"><ha-icon icon="mdi:home-account" aria-hidden="true"></ha-icon><h3>${this.t("unconfigured")}</h3><p>${this.t("configureRoomHelp")}</p><button class="primary" @click=${() => this.addRoom(selected.areaId)}>${this.t("configure")}</button></div>`
          : html`<div class="empty-state welcome"><ha-icon icon="mdi:home-account" aria-hidden="true"></ha-icon><h2 class="view-title" tabindex="-1">${this.t("chooseRoom")}</h2><p>${this.t("chooseRoomHelp")}</p></div>`}
      </section></div>`;
  }
  private detailHeading(name: string, view: View) {
    return html`<div class="room-heading"><button class="icon-button back-button" aria-label=${this.t("back")} @click=${() => this.navigate(view)}><ha-icon icon="mdi:arrow-left" aria-hidden="true"></ha-icon></button><h2 class="view-title grow" tabindex="-1">${name}</h2></div>`;
  }
  private roomEditor(r: Room) {
    const result = this.snapshot!.runtime.rooms[r.id];
    return html`${this.detailHeading(this.roomName(r.id), "rooms")}
      <div class="room-summary"><div class="row">${this.status(result?.occupied)}<span class="badge">${this.t(result?.reason ?? "unconfigured")}</span></div>
        <div class="room-toolbar"><div class="actions">
          <button ?disabled=${!result} @click=${() => this.command("room_override", r.id, "occupied", this.overrideMinutes * 60)}><ha-icon icon="mdi:account-check-outline" aria-hidden="true"></ha-icon>${this.t("forceOccupied")}</button>
          <button ?disabled=${!result} @click=${() => this.command("room_override", r.id, "clear", this.overrideMinutes * 60)}><ha-icon icon="mdi:account-off-outline" aria-hidden="true"></ha-icon>${this.t("forceClear")}</button>
          ${result?.override ? html`<button @click=${() => this.command("room_override", r.id, "auto")}><ha-icon icon="mdi:restore" aria-hidden="true"></ha-icon>${this.t("resume")}</button>` : nothing}
        </div><div class="room-modes">${this.check("enabled", r.enabled, enabled => this.patchRoom({ enabled }))}</div></div>
        <p class="help compact-help">${this.t("presenceControlsHelp")}</p>
      </div>
      <nav class="room-tabs" role="tablist" aria-label=${this.t("roomSections")}>${roomSections.map(section => html`<button role="tab" id=${`room-tab-${section}`} aria-controls="room-panel" aria-selected=${String(this.roomSection === section)} tabindex=${this.roomSection === section ? "0" : "-1"}
        @keydown=${(e: KeyboardEvent) => this.roomTabKey(e, section)} @click=${() => this.selectRoomSection(section)}>${this.t(section + "Tab")}</button>`)}</nav>
      <div id="room-panel" class="room-panel" role="tabpanel" aria-labelledby=${`room-tab-${this.roomSection}`}>
        ${this.roomSection === "presence" ? this.roomPresence(r) : this.roomSection === "detection" ? this.roomDetection(r) : this.roomSection === "timing" ? this.roomTiming(r)
          : this.roomSection === "context" ? html`<section class="settings-group"><h3>${this.t("contextTab")}</h3><p class="help">${this.t("contextHelp")}</p>${this.condition("gate", r.gate, gate => this.patchRoom({ gate }))}${this.condition("release", r.release, release => this.patchRoom({ release }))}</section>` : this.roomSettings(r)}
      </div>`;
  }
  private roomPresence(r: Room) {
    const result = this.snapshot!.runtime.rooms[r.id];
    const active = this.snapshot!.config?.rooms[r.id] ?? r;
    const sourceIds = new Set<string>();
    const collect = (condition: Condition | null) => { if (!condition) return; if (condition.entity_id) sourceIds.add(condition.entity_id); condition.conditions?.forEach(collect); if (condition.condition) collect(condition.condition); };
    [active.entry, active.hold, ...active.doors, active.gate, active.release].forEach(collect);
    return html`<section class="settings-group"><div class="section-heading"><h3>${this.t("details")}</h3></div>
      <p class="row">${result?.latched ? html`<ha-icon icon="mdi:lock-outline" aria-hidden="true"></ha-icon>` : nothing}${this.t(result?.reason ?? "saveFirst")}</p>
      ${result ? html`<details class="help-details"><summary>${this.t("evidence")}</summary><p class="help">${result.evidence.map(id => this.entities.find(e => e.entity_id === id)?.name ?? id).join(", ") || "—"}</p></details>` : nothing}
      ${result?.recovery_until != null ? html`<p class="readout">${this.t("recoveryUntil")}: ${new Date(result.recovery_until * 1000).toLocaleTimeString(this.locale)}</p>` : nothing}
      <p class="help readout">${result?.next_deadline ? `${this.t("next")}: ${new Date(result.next_deadline * 1000).toLocaleTimeString(this.locale)}` : this.t("noDeadline")}</p></section>
      <section class="settings-group"><h3>${this.t("sources")}</h3>
        ${sourceIds.size ? html`<div class="source-list">${[...sourceIds].map(id => { const entity = this.entities.find(e => e.entity_id === id); return html`<div class="source-row"><ha-icon icon=${entity?.device_class === "door" || entity?.device_class === "opening" ? "mdi:door" : "mdi:motion-sensor"} aria-hidden="true"></ha-icon><div class="grow"><strong>${entity?.name ?? id}</strong><small>${id}</small></div><span class="badge">${entity?.state ?? this.t("unknown")}</span></div>`; })}</div>` : html`<p class="help">${this.t("noSources")}</p>`}
      </section>
      <section class="settings-group"><h3>${this.t("manual_override")}</h3><div class="field-grid">${this.number("duration", this.overrideMinutes, value => { this.overrideMinutes = value; }, 10080)}</div><p class="help compact-help">${this.t("overrideHelp")}</p></section>`;
  }
  private roomDetection(r: Room) {
    return html`<section class="settings-group"><h3>${this.t("profile")}</h3><label>${this.t("profile")}<select data-selected=${r.profile} .value=${r.profile} @change=${(e: Event) => this.patchRoom({ profile: (e.target as HTMLSelectElement).value as Room["profile"] })}>${profiles.map(p => html`<option value=${p} ?selected=${r.profile === p}>${this.t(p)}</option>`)}</select></label><p class="help">${this.t(r.profile + "Help")}</p>
      ${r.area_id ? html`<details class="help-details"><summary>${this.t("suggestions")}</summary><p class="help">${this.t("suggestHelp")}</p>${(this.snapshot!.suggestions?.[r.area_id] ?? []).map(choice => html`<div class="suggestion"><strong>${this.t(choice.profile)}</strong><p class="help">${this.t(choice.reason)}</p><small>${[...choice.entry, ...choice.hold, ...choice.doors].map(id => this.entities.find(e => e.entity_id === id)?.name ?? id).join(" · ")}</small><p><button @click=${() => this.patchRoom(applySuggestion(r, choice))}>${this.t("apply")}</button></p></div>`)}</details>` : nothing}</section>
      <section class="settings-group">${this.condition("entry", r.entry, entry => this.patchRoom({ entry }), false)}${r.profile === "hybrid" ? this.condition("hold", r.hold, hold => this.patchRoom({ hold })) : nothing}</section>
      <section class="settings-group"><h3>${this.t("doors")}</h3><p class="help">${this.t("doorsHelp")}</p>${r.doors.map((door, i) => this.condition("entity", door, value => this.patchRoom({ doors: value ? r.doors.map((d, j) => i === j ? value : d) : r.doors.filter((_, j) => j !== i) }), true, true, true))}<button @click=${() => this.patchRoom({ doors: [...r.doors, defaultCondition("state")] })}><ha-icon icon="mdi:plus" aria-hidden="true"></ha-icon>${this.t("addDoor")}</button></section>`;
  }
  private roomTiming(r: Room) {
    const hasDoor = this.hasConfiguredDoor(r);
    return html`<section class="settings-group"><h3>${this.t("confirmationDelays")}</h3><div class="field-grid">${(["on_delay", "off_delay", ...(r.profile === "bee" ? ["open_delay", "close_delay", "latch_max"] : [])] as (keyof Room)[]).map(key => this.number(key, r[key] as number, value => this.patchRoom({ [key]: value })))}</div></section>
      ${r.profile === "bee" ? html`<section class="settings-group"><h3>${this.t("entryProtection")}</h3>${this.check("require_opening", r.require_opening ?? false, require_opening => this.patchRoom({ require_opening, recovery_delay: r.recovery_delay ?? 120 }), !hasDoor && !r.require_opening, !hasDoor ? "door-options-help" : undefined)}<p class="help">${this.t("requireOpeningHelp")}</p>
        ${r.require_opening ? html`<div class="field-grid">${this.number("recovery_delay", r.recovery_delay ?? 120, recovery_delay => this.patchRoom({ recovery_delay }))}</div><details class="help-details"><summary>${this.t("timingHelp")}</summary><p class="help">${this.t("recoveryHelp")}</p><p class="help">${this.t("beeTimingHelp")}</p></details>` : nothing}</section>` : nothing}
      <section class="settings-group"><h3>${this.t("doorOptions")}</h3>
        ${!hasDoor ? html`<p class="help" id="door-options-help">${this.t("doorOptionsHelp")}</p><button class="link" @click=${() => this.selectRoomSection("detection")}>${this.t("configureDoors")}</button>` : nothing}
        ${this.check("anticipate", r.anticipate, anticipate => this.patchRoom({ anticipate }), !hasDoor && !r.anticipate, !hasDoor ? "door-options-help" : undefined)}${this.check("keep_open", r.keep_open, keep_open => this.patchRoom({ keep_open }), !hasDoor && !r.keep_open, !hasDoor ? "door-options-help" : undefined)}</section>`;
  }
  private roomSettings(r: Room) {
    return html`<section class="settings-group"><h3>${this.t("roomIdentity")}</h3><div class="field-grid">${this.text("name", r.name, name => this.patchRoom({ name }))}<label>${this.t("area")}<select data-selected=${r.area_id ?? ""} .value=${r.area_id ?? ""} @change=${(e: Event) => this.patchRoom({ area_id: (e.target as HTMLSelectElement).value || null })}><option value="" ?selected=${!r.area_id}>${this.t("noArea")}</option>${this.snapshot!.catalog!.areas.map(a => html`<option value=${a.area_id} ?selected=${r.area_id === a.area_id}>${a.name}</option>`)}</select></label></div><p class="help readout">${this.t("identifier")}: <code>${r.id}</code></p></section>
      <details class="danger-zone"><summary>${this.t("removeRoom")}</summary><p class="help">${this.t("removeRoomHelp")}</p><button class="danger" @click=${() => { this.change(c => { delete c.rooms[r.id]; }); this.selectedRoom = ""; }}>${this.t("remove")}</button></details>`;
  }
  private addResident() { if (!this.valid()) return; const id = createId(); this.change(c => { c.residents[id] = resident(id); }); this.view = "residents"; this.selectedResident = id; }
  private residents() {
    if (!this.config) return nothing;
    const r = this.config.residents[this.selectedResident];
    const keys = Object.keys(this.config.residents).filter(key => this.residentName(key).toLocaleLowerCase().includes(this.residentQuery.toLocaleLowerCase()));
    return html`<div class="workspace ${r ? "has-selection" : ""}"><aside class="room-rail" aria-label=${this.t("residents")}><div class="rail-heading"><h2 tabindex="-1">${this.t("residents")}</h2><span class="count">${Object.keys(this.config.residents).length}</span></div>
      <label class="rail-search"><span>${this.t("searchResidents")}</span><input type="search" .value=${this.residentQuery} @input=${(e: Event) => { this.residentQuery = (e.target as HTMLInputElement).value; }}></label>
      <div class="room-list">${keys.map(key => { const state = this.snapshot!.runtime.residents[key]; return html`<div class="room-item" ?data-active=${key === this.selectedResident}><button class="room-link" aria-label=${this.residentName(key)} aria-current=${key === this.selectedResident ? "page" : nothing} @click=${() => this.navigate("residents", key)}><ha-icon icon="mdi:account-circle-outline" aria-hidden="true"></ha-icon><span><strong>${this.residentName(key)}</strong><small class="room-meta">${this.t(state?.present == null ? "unknown" : state.present ? "present" : "absent")} · ${this.t(state?.sleeping == null ? "unknown" : state.sleeping ? "sleeping" : "awake")}</small></span></button></div>`; })}</div>
      <button class="link rail-add" @click=${() => this.addResident()}><ha-icon icon="mdi:plus" aria-hidden="true"></ha-icon>${this.t("addResident")}</button></aside><section class="room-detail">${r ? html`${this.detailHeading(this.residentName(r.id), "residents")}<section class="settings-group"><h3>${this.t("residentIdentity")}</h3>${this.text("name", r.name, name => this.change(c => { c.residents[r.id].name = name; }))}
      <hapo-entity-picker .entities=${this.entities} .value=${r.entity_id} .locale=${this.locale} .label=${this.t("personEntity")} required @entity-changed=${(e: CustomEvent) => this.change(c => { c.residents[r.id].entity_id = e.detail.value ?? ""; })}></hapo-entity-picker>
      ${this.text("homeStates", r.home_states.join(", "), value => this.change(c => { c.residents[r.id].home_states = value.split(",").map(s => s.trim()).filter(Boolean); }), true, true)}${this.number("presenceDelay", r.presence_delay, value => this.change(c => { c.residents[r.id].presence_delay = value; }))}
      ${this.condition("sleepSource", r.sleep_source, value => this.change(c => { c.residents[r.id].sleep_source = value; }), true, true)}<p class="hint">${this.t("sleepHelp")}</p><details><summary>${this.t("details")}</summary><p class="readout">${this.t("identifier")}: <code>${r.id}</code></p></details>
      </section>${this.snapshot!.runtime.residents[r.id] ? html`<div class="actions"><button @click=${() => this.command("sleep", r.id, "sleeping")}>${this.t("sleep")}</button><button @click=${() => this.command("sleep", r.id, "awake")}>${this.t("wake")}</button><button @click=${() => this.command("sleep", r.id, "auto")}>${this.t("resetSleep")}</button></div>` : nothing}<div class="section"><button class="danger link" @click=${() => { this.change(c => { delete c.residents[r.id]; }); this.selectedResident = ""; }}>${this.t("remove")}</button></div>` : html`<div class="empty"><p>${this.t("emptyResidents")}</p><button @click=${() => this.addResident()}>${this.t("addResident")}</button></div>`}</section></div>`;
  }
  private home() {
    if (!this.config) return nothing;
    const home = this.config.home;
    return html`<div class="global-settings"><div class="section-heading"><h2 class="view-title" tabindex="-1">${this.t("globalSettings")}</h2></div>${this.homeSummary()}<section class="settings-group"><h3>${this.t("homeSource")}</h3><label>${this.t("homeSource")}<select data-selected=${home.source} .value=${home.source} @change=${(e: Event) => this.change(c => { c.home.source = (e.target as HTMLSelectElement).value as Config["home"]["source"]; })}>${[["residents", "residentSource"], ["entity", "entitySource"], ["rooms", "roomSource"]].map(([value, label]) => html`<option value=${value} ?selected=${home.source === value}>${this.t(label)}</option>`)}</select></label><p class="hint">${this.t("sourceHelp")}</p>
      ${home.source === "entity" ? this.condition("entity", home.entity, value => this.change(c => { c.home.entity = value; }), false, true) : home.source === "rooms" ? html`${Object.keys(this.config.rooms).map(key => this.check(this.roomName(key), home.rooms.includes(key), enabled => this.change(c => { c.home.rooms = enabled ? [...c.home.rooms, key] : c.home.rooms.filter(r => r !== key); })))}` : nothing}
      ${this.number("failureGrace", this.config.failure_grace, value => this.change(c => { c.failure_grace = value; }))}
      </section><section class="settings-group"><h3>${this.t("mode")}</h3><p class="hint">${this.t("modeHelp")}</p>${home.modes.map((mode, index) => html`<div class="mode-card"><div class="toolbar"><strong>${mode.name || this.t(mode.id)}</strong><div class="actions"><button aria-label=${this.t("up")} ?disabled=${index === 0} @click=${() => this.moveMode(index, -1)}>↑</button><button aria-label=${this.t("down")} ?disabled=${index === home.modes.length - 1} @click=${() => this.moveMode(index, 1)}>↓</button><button class="danger link" ?disabled=${home.modes.length === 1} @click=${() => this.change(c => { c.home.modes.splice(index, 1); })}>${this.t("remove")}</button></div></div><div class="fields"><label>${this.t("modeKey")}<input required pattern="[a-z0-9][a-z0-9_-]{0,63}" .value=${mode.id} ?readonly=${this.snapshot!.config!.home.modes.some(m => m.id === mode.id)} @change=${(e: Event) => this.change(c => { c.home.modes[index].id = (e.target as HTMLInputElement).value; })}></label>${this.text("modeName", mode.name, value => this.change(c => { c.home.modes[index].name = value; }))}</div>${this.condition("condition", mode.condition, value => this.change(c => { c.home.modes[index].condition = value!; }), false)}</div>`)}
      <button class="section" @click=${() => this.change(c => { c.home.modes.push({ id: "mode_" + createId().slice(0, 8), name: "", condition: defaultCondition("state") }); })}>+ ${this.t("addMode")}</button>
      </section><details><summary>${this.t("manual_override")}</summary>${this.number("duration", this.overrideMinutes, value => { this.overrideMinutes = value; }, 10080)}<label>${this.t("mode")}<select data-selected=${this.selectedMode} .value=${this.selectedMode} @change=${(e: Event) => { this.selectedMode = (e.target as HTMLSelectElement).value; }}><option value="auto" ?selected=${this.selectedMode === "auto"}>${this.t("auto")}</option>${this.snapshot!.config!.home.modes.map(mode => html`<option value=${mode.id} ?selected=${this.selectedMode === mode.id}>${mode.name || this.t(mode.id)}</option>`)}</select></label><button @click=${() => this.command("home_override", "", this.selectedMode, this.overrideMinutes * 60)}>${this.t("forceMode")}</button></details>
      <details><summary>${this.t("transfer")}</summary><p class="hint">${this.t("importHelp")}</p><div class="actions"><button @click=${() => this.download()}>${this.t("export")}</button><label>${this.t("import")}<input type="file" accept="application/json,.json" @change=${(e: Event) => this.importFile(e)}></label></div></details>
    <details class="section"><summary>${this.t("about")}</summary><p><strong>Hapo</strong> — Home Assistant Presence Orchestrator</p></details></div>`;
  }
  private moveMode(index: number, direction: number) { this.change(c => { const [mode] = c.home.modes.splice(index, 1); c.home.modes.splice(index + direction, 0, mode); }); }
}
customElements.define("hapo-panel", HapoPanel);
