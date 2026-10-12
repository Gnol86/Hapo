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
export class HapoPanel extends LitElement {
  static properties = { hass: { attribute: false }, snapshot: { state: true }, draft: { state: true }, view: { state: true }, selectedRoom: { state: true }, selectedResident: { state: true }, error: { state: true }, saving: { state: true }, message: { state: true }, query: { state: true } };
  static styles = panelStyles;
  hass?: Hass;
  snapshot?: Snapshot;
  draft?: Config;
  private baseRevision = 0;
  private view: View = "overview";
  private selectedRoom = "";
  private selectedResident = "";
  private error = "";
  private message = "";
  private saving = false;
  private query = "";
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
  private patchRoom(change: Partial<Room>) { this.change(c => Object.assign(c.rooms[this.selectedRoom], change)); }
  private valid(): boolean {
    let valid = true;
    for (const input of this.renderRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement | HapoCondition>("input,select,hapo-condition,hapo-entity-picker")) {
      if (!input.reportValidity()) { valid = false; let parent = input.parentElement; while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; } }
    }
    if (!valid) this.error = this.t("invalid");
    return valid;
  }
  private navigate(view: View, key = "") { if (!this.valid()) return; this.view = view; if (view === "rooms") this.selectedRoom = key; if (view === "residents") this.selectedResident = key; this.error = ""; }
  private async save() {
    if (!this.hass || !this.draft || !this.valid() || this.saving) return;
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
  private check(label: string, value: boolean, update: (v: boolean) => void) { return html`<label class="check"><input type="checkbox" .checked=${value} @change=${(e: Event) => update((e.target as HTMLInputElement).checked)}>${this.t(label)}</label>`; }
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
    return html`<header><button class="menu-button" aria-label=${this.t("menu")} @click=${() => this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))}>☰</button><div class="brand"><svg class="mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M7 23 24 8l17 15v18H29V29H19v12H7Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="24" cy="21" r="3" fill="currentColor"/></svg><div><h1>Hapo</h1><small>${this.t("subtitle")}</small></div></div>${this.snapshot ? this.status(this.snapshot.runtime.home.occupied) : nothing}</header>
      <nav aria-label="Hapo">${(["overview", "rooms", "residents", "home"] as View[]).filter(v => this.admin || v === "overview").map(view => html`<button aria-current=${this.view === view ? "page" : "false"} @click=${() => this.navigate(view)}>${this.t(view)}</button>`)}</nav>
      <main ?inert=${this.saving}>${this.error ? html`<div role="alert" class="error">${this.error}</div>` : nothing}${this.conflict ? html`<div role="alert" class="notice">${this.t("conflict")}</div>` : nothing}${this.message ? html`<div role="status" class="notice">${this.message}</div>` : nothing}
        ${!this.snapshot ? html`<div class="empty"><p>${this.t("loading")}</p>${this.error ? html`<button @click=${() => this.connect()}>${this.t("retry")}</button>` : nothing}</div>` : keyed(this.editorEpoch, this.view === "overview" ? this.overview() : this.view === "rooms" ? this.rooms() : this.view === "residents" ? this.residents() : this.home())}
      </main>${this.draft ? html`<footer class="savebar"><span>${this.t("draft")}</span><div class="actions"><button ?disabled=${this.saving} @click=${() => this.discard()}>${this.t("discard")}</button><button class="primary" ?disabled=${this.saving || this.conflict} @click=${() => this.save()}>${this.t(this.saving ? "saving" : "save")}</button></div></footer>` : nothing}`;
  }
  private overview() {
    const home = this.snapshot!.runtime.home;
    return html`<section class="home-banner"><div><small>${this.t("home")}</small><div class="home-mode">${this.modeName(home.mode)}</div>${home.degraded ? html`<small>${this.t("degraded")}</small>` : nothing}</div><div class="numbers">${["present_count", "awake_count", "sleeping_count"].map(key => html`<div><span class="number">${home[key as "present_count"] ?? "—"}</span><small>${this.t(key)}</small></div>`)}</div>${this.check("guests", home.guests ?? false, value => void this.command("guests", "", value))}</section>
      <div class="toolbar"><h2>${this.t("rooms")}</h2>${this.admin ? html`<button @click=${() => this.addRoom()}>+ ${this.t("addRoom")}</button>` : nothing}</div>
      ${Object.keys(this.snapshot!.runtime.rooms).length ? html`<div class="grid">${Object.entries(this.snapshot!.runtime.rooms).map(([key, result]) => html`<article class="card"><div class="card-top"><button class="title" ?disabled=${!this.admin} @click=${() => this.navigate("rooms", key)}>${this.roomName(key)}</button>${this.status(result.occupied)}</div><p class="hint">${this.t(result.reason)}</p>${result.next_deadline ? html`<small class="readout">${this.t("next")} · ${new Date(result.next_deadline * 1000).toLocaleTimeString(this.locale)}</small>` : nothing}<div class="actions"><button class="link" @click=${() => this.command("room_override", key, "auto")}>${this.t("resume")}</button></div></article>`)}</div>` : html`<div class="empty"><p>${this.t("emptyRooms")}</p></div>`}
      <h2 class="section">${this.t("residents")}</h2><div class="grid">${Object.entries(this.snapshot!.runtime.residents).map(([key, r]) => html`<article class="card"><div class="card-top"><h3>${this.residentName(key)}</h3><small>${this.t(r.present == null ? "unknown" : r.present ? "present" : "absent")}</small></div><p>${this.t(r.sleeping == null ? "unknown" : r.sleeping ? "sleeping" : "awake")}</p><div class="actions"><button @click=${() => this.command("sleep", key, "sleeping")}>${this.t("sleep")}</button><button @click=${() => this.command("sleep", key, "awake")}>${this.t("wake")}</button></div></article>`)}</div>`;
  }
  private addRoom() { if (!this.valid()) return; const id = createId(); this.change(c => { c.rooms[id] = room(id); }); this.view = "rooms"; this.selectedRoom = id; }
  private rooms() {
    if (!this.config) return nothing;
    const current = this.config.rooms[this.selectedRoom];
    return html`<div class="split ${current ? "has-selection" : ""}"><aside class="sidebar"><input aria-label=${this.t("search")} placeholder=${this.t("search")} .value=${this.query} @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }}>${Object.keys(this.config.rooms).filter(key => this.roomName(key).toLocaleLowerCase().includes(this.query.toLocaleLowerCase())).map(key => html`<button class=${key === this.selectedRoom ? "selected" : ""} @click=${() => this.navigate("rooms", key)}><span>${this.roomName(key)}</span>${this.status(this.snapshot!.runtime.rooms[key]?.occupied)}</button>`)}<button class="link" @click=${() => this.addRoom()}>+ ${this.t("addRoom")}</button></aside><section class="editor">${current ? this.roomEditor(current) : html`<div class="empty"><p>${this.t("emptyRooms")}</p><button @click=${() => this.addRoom()}>${this.t("addRoom")}</button></div>`}</section></div>`;
  }
  private roomEditor(r: Room) {
    const result = this.snapshot!.runtime.rooms[r.id];
    return html`<button class="mobile-back link" @click=${() => this.navigate("rooms")}>← ${this.t("back")}</button><div class="editor-head"><h2>${this.roomName(r.id)}</h2>${this.status(result?.occupied)}</div>
      <div class="fields">${this.text("name", r.name, name => this.patchRoom({ name }))}<label>${this.t("area")}<select data-selected=${r.area_id ?? ""} .value=${r.area_id ?? ""} @change=${(e: Event) => this.patchRoom({ area_id: (e.target as HTMLSelectElement).value || null })}><option value="" ?selected=${!r.area_id}>${this.t("noArea")}</option>${this.snapshot!.catalog!.areas.map(a => html`<option value=${a.area_id} ?selected=${r.area_id === a.area_id}>${a.name}</option>`)}</select></label></div>
      <label>${this.t("profile")}<select data-selected=${r.profile} .value=${r.profile} @change=${(e: Event) => this.patchRoom({ profile: (e.target as HTMLSelectElement).value as Room["profile"] })}>${profiles.map(p => html`<option value=${p} ?selected=${r.profile === p}>${this.t(p)}</option>`)}</select></label><p class="hint">${this.t(r.profile + "Help")}</p>
      ${r.area_id ? html`<details><summary>${this.t("suggestions")}</summary><p class="hint">${this.t("suggestHelp")}</p>${(this.snapshot!.suggestions?.[r.area_id] ?? []).map(choice => html`<div class="suggestion"><strong>${this.t(choice.profile)}</strong><p class="hint">${this.t(choice.reason)}</p><small>${[...choice.entry, ...choice.hold, ...choice.doors].map(id => this.entities.find(e => e.entity_id === id)?.name ?? id).join(" · ")}</small><p><button @click=${() => this.change(c => { c.rooms[r.id] = applySuggestion(r, choice); })}>${this.t("apply")}</button></p></div>`)}</details>` : nothing}
      ${this.condition("entry", r.entry, entry => this.patchRoom({ entry }), false)}
      ${r.profile === "hybrid" ? this.condition("hold", r.hold, hold => this.patchRoom({ hold })) : nothing}
      ${r.profile === "bee" || r.doors.length > 0 || r.anticipate || r.keep_open ? html`<section class="section"><h3>${this.t("doors")}</h3>${r.doors.map((door, i) => this.condition("entity", door, value => this.patchRoom({ doors: value ? r.doors.map((d, j) => i === j ? value : d) : r.doors.filter((_, j) => j !== i) }), true, true, true))}<button @click=${() => this.patchRoom({ doors: [...r.doors, defaultCondition("state")] })}>+ ${this.t("addDoor")}</button></section>` : nothing}
      <details><summary>${this.t("delays")}</summary><div class="fields">${(["on_delay", "off_delay", ...(r.profile === "bee" ? ["open_delay", "close_delay", "latch_max"] : [])] as (keyof Room)[]).map(key => this.number(key, r[key] as number, value => this.patchRoom({ [key]: value })))}</div>${this.check("anticipate", r.anticipate, anticipate => this.patchRoom({ anticipate }))}${this.check("keep_open", r.keep_open, keep_open => this.patchRoom({ keep_open }))}${this.check("enabled", r.enabled, enabled => this.patchRoom({ enabled }))}</details>
      <details ?open=${r.profile === "contextual"}><summary>${this.t("contextual")}</summary>${this.condition("gate", r.gate, gate => this.patchRoom({ gate }))}${this.condition("release", r.release, release => this.patchRoom({ release }))}</details>
      ${result ? html`<details><summary>${this.t("details")}</summary><p class="readout">${this.t("identifier")}: <code>${r.id}</code></p><p>${this.t(result.reason)}</p>${result.latched ? html`<p>${this.t("latched")}</p>` : nothing}<small>${this.t("evidence")}: ${result.evidence.map(id => this.entities.find(e => e.entity_id === id)?.name ?? id).join(", ") || "—"}</small><p>${result.next_deadline ? `${this.t("next")}: ${new Date(result.next_deadline * 1000).toLocaleTimeString(this.locale)}` : this.t("noDeadline")}</p>${this.number("duration", this.overrideMinutes, value => { this.overrideMinutes = value; }, 10080)}<div class="actions"><button @click=${() => this.command("room_override", r.id, "occupied", this.overrideMinutes * 60)}>${this.t("forceOccupied")}</button><button @click=${() => this.command("room_override", r.id, "clear", this.overrideMinutes * 60)}>${this.t("forceClear")}</button><button @click=${() => this.command("room_override", r.id, "auto")}>${this.t("resume")}</button></div></details>` : nothing}
      <div class="section"><button class="danger link" @click=${() => { this.change(c => { delete c.rooms[r.id]; }); this.selectedRoom = ""; }}>${this.t("remove")}</button></div>`;
  }
  private addResident() { if (!this.valid()) return; const id = createId(); this.change(c => { c.residents[id] = resident(id); }); this.selectedResident = id; }
  private residents() {
    if (!this.config) return nothing;
    const r = this.config.residents[this.selectedResident];
    return html`<div class="split ${r ? "has-selection" : ""}"><aside class="sidebar">${Object.keys(this.config.residents).map(key => html`<button class=${key === this.selectedResident ? "selected" : ""} @click=${() => this.navigate("residents", key)}>${this.residentName(key)}</button>`)}<button class="link" @click=${() => this.addResident()}>+ ${this.t("addResident")}</button></aside><section class="editor">${r ? html`<button class="mobile-back link" @click=${() => this.navigate("residents")}>← ${this.t("back")}</button><h2>${this.residentName(r.id)}</h2>${this.text("name", r.name, name => this.change(c => { c.residents[r.id].name = name; }))}
      <hapo-entity-picker .entities=${this.entities} .value=${r.entity_id} .locale=${this.locale} .label=${this.t("personEntity")} required @entity-changed=${(e: CustomEvent) => this.change(c => { c.residents[r.id].entity_id = e.detail.value ?? ""; })}></hapo-entity-picker>
      ${this.text("homeStates", r.home_states.join(", "), value => this.change(c => { c.residents[r.id].home_states = value.split(",").map(s => s.trim()).filter(Boolean); }), true, true)}${this.number("presenceDelay", r.presence_delay, value => this.change(c => { c.residents[r.id].presence_delay = value; }))}
      ${this.condition("sleepSource", r.sleep_source, value => this.change(c => { c.residents[r.id].sleep_source = value; }), true, true)}<p class="hint">${this.t("sleepHelp")}</p><details><summary>${this.t("details")}</summary><p class="readout">${this.t("identifier")}: <code>${r.id}</code></p></details>
      ${this.snapshot!.runtime.residents[r.id] ? html`<div class="actions"><button @click=${() => this.command("sleep", r.id, "sleeping")}>${this.t("sleep")}</button><button @click=${() => this.command("sleep", r.id, "awake")}>${this.t("wake")}</button><button @click=${() => this.command("sleep", r.id, "auto")}>${this.t("resetSleep")}</button></div>` : nothing}<div class="section"><button class="danger link" @click=${() => { this.change(c => { delete c.residents[r.id]; }); this.selectedResident = ""; }}>${this.t("remove")}</button></div>` : html`<div class="empty"><p>${this.t("emptyResidents")}</p><button @click=${() => this.addResident()}>${this.t("addResident")}</button></div>`}</section></div>`;
  }
  private home() {
    if (!this.config) return nothing;
    const home = this.config.home;
    return html`<section class="editor"><h2>${this.t("home")}</h2><label>${this.t("homeSource")}<select data-selected=${home.source} .value=${home.source} @change=${(e: Event) => this.change(c => { c.home.source = (e.target as HTMLSelectElement).value as Config["home"]["source"]; })}>${[["residents", "residentSource"], ["entity", "entitySource"], ["rooms", "roomSource"]].map(([value, label]) => html`<option value=${value} ?selected=${home.source === value}>${this.t(label)}</option>`)}</select></label><p class="hint">${this.t("sourceHelp")}</p>
      ${home.source === "entity" ? this.condition("entity", home.entity, value => this.change(c => { c.home.entity = value; }), false, true) : home.source === "rooms" ? html`${Object.keys(this.config.rooms).map(key => this.check(this.roomName(key), home.rooms.includes(key), enabled => this.change(c => { c.home.rooms = enabled ? [...c.home.rooms, key] : c.home.rooms.filter(r => r !== key); })))}` : nothing}
      ${this.number("failureGrace", this.config.failure_grace, value => this.change(c => { c.failure_grace = value; }))}
      <h3>${this.t("mode")}</h3><p class="hint">${this.t("modeHelp")}</p>${home.modes.map((mode, index) => html`<div class="mode-card"><div class="toolbar"><strong>${mode.name || this.t(mode.id)}</strong><div class="actions"><button aria-label=${this.t("up")} ?disabled=${index === 0} @click=${() => this.moveMode(index, -1)}>↑</button><button aria-label=${this.t("down")} ?disabled=${index === home.modes.length - 1} @click=${() => this.moveMode(index, 1)}>↓</button><button class="danger link" ?disabled=${home.modes.length === 1} @click=${() => this.change(c => { c.home.modes.splice(index, 1); })}>${this.t("remove")}</button></div></div><div class="fields"><label>${this.t("modeKey")}<input required pattern="[a-z0-9][a-z0-9_-]{0,63}" .value=${mode.id} ?readonly=${this.snapshot!.config!.home.modes.some(m => m.id === mode.id)} @change=${(e: Event) => this.change(c => { c.home.modes[index].id = (e.target as HTMLInputElement).value; })}></label>${this.text("modeName", mode.name, value => this.change(c => { c.home.modes[index].name = value; }))}</div>${this.condition("condition", mode.condition, value => this.change(c => { c.home.modes[index].condition = value!; }), false)}</div>`)}
      <button class="section" @click=${() => this.change(c => { c.home.modes.push({ id: "mode_" + createId().slice(0, 8), name: "", condition: defaultCondition("state") }); })}>+ ${this.t("addMode")}</button>
      <details><summary>${this.t("manual_override")}</summary>${this.number("duration", this.overrideMinutes, value => { this.overrideMinutes = value; }, 10080)}<label>${this.t("mode")}<select data-selected=${this.selectedMode} .value=${this.selectedMode} @change=${(e: Event) => { this.selectedMode = (e.target as HTMLSelectElement).value; }}><option value="auto" ?selected=${this.selectedMode === "auto"}>${this.t("auto")}</option>${this.snapshot!.config!.home.modes.map(mode => html`<option value=${mode.id} ?selected=${this.selectedMode === mode.id}>${mode.name || this.t(mode.id)}</option>`)}</select></label><button @click=${() => this.command("home_override", "", this.selectedMode, this.overrideMinutes * 60)}>${this.t("forceMode")}</button></details>
      <details><summary>${this.t("transfer")}</summary><p class="hint">${this.t("importHelp")}</p><div class="actions"><button @click=${() => this.download()}>${this.t("export")}</button><label>${this.t("import")}<input type="file" accept="application/json,.json" @change=${(e: Event) => this.importFile(e)}></label></div></details>
    </section>`;
  }
  private moveMode(index: number, direction: number) { this.change(c => { const [mode] = c.home.modes.splice(index, 1); c.home.modes.splice(index + direction, 0, mode); }); }
}
customElements.define("hapo-panel", HapoPanel);
