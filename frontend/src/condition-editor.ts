import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { controls } from "./styles";
import { defaultCondition } from "./model";
import { translate } from "./translations";
import type { Condition, Config, EntityOption } from "./types";
import "./entity-picker";

export class HapoCondition extends LitElement {
  static properties = { value: { attribute: false }, entities: { attribute: false }, config: { attribute: false }, locale: {}, label: {}, optional: { type: Boolean }, externalOnly: { type: Boolean }, stateOnly: { type: Boolean } };
  static styles = [controls, css`
    :host { display: block; min-width: 0; margin: 8px 0; color-scheme: inherit; }
    .condition { min-width: 0; padding: 12px; margin: 12px 0; border: 1px solid var(--hapo-line); border-radius: var(--hapo-control-radius); background: var(--hapo-surface); }
    .top { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
    .top label { flex: 1; min-width: min(100%,180px); }
    .top button { margin-bottom: 8px; }
    .child { margin: 10px 0; }
    .sub { font-size: var(--ha-font-size-s,12px); color: var(--hapo-secondary); }
    .title { font-size: var(--ha-font-size-m,14px); font-weight: var(--ha-font-weight-medium,500); margin: 14px 0 6px; }
  `];
  value: Condition | null = null;
  entities: EntityOption[] = [];
  config?: Config;
  locale?: string;
  label = "";
  optional = false;
  externalOnly = false;
  stateOnly = false;
  private t(key: string) { return translate(key, this.locale); }
  private emit(value: Condition | null) { this.dispatchEvent(new CustomEvent("condition-changed", { detail: { value }, bubbles: true, composed: true })); }
  private patch(change: Partial<Condition>) { this.emit({ ...this.value!, ...change }); }
  private text(label: string, value: string, change: (value: string) => void, required = false) {
    return html`<label>${this.t(label)}<input .value=${value} ?required=${required} @change=${(e: Event) => change((e.target as HTMLInputElement).value)}></label>`;
  }
  private number(label: string, value: number | undefined, change: (value: number | undefined) => void, optional = false, min?: number) {
    return html`<label>${this.t(label)}<input type="number" step="any" min=${min ?? nothing} .value=${value === undefined ? "" : String(value)} ?required=${!optional} @input=${(e: Event) => { const input = e.target as HTMLInputElement; if (input.validity.valid) change(input.value === "" ? undefined : input.valueAsNumber); }}></label>`;
  }
  private select(label: string, value: string, choices: [string, string][], change: (v: string) => void) {
    return html`<label>${this.t(label)}<select data-selected=${value} .value=${value} required @change=${(e: Event) => change((e.target as HTMLSelectElement).value)}>${!choices.some(([key]) => key === value) ? html`<option value="" ?selected=${true}>—</option>` : nothing}${choices.map(([key, name]) => html`<option value=${key} ?selected=${key === value}>${name}</option>`)}</select></label>`;
  }
  reportValidity(): boolean {
    let valid = true;
    for (const input of this.renderRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement | HapoCondition>("input,select,hapo-condition,hapo-entity-picker")) {
      if (!input.reportValidity()) valid = false;
    }
    if (!this.value && !this.optional) valid = false;
    return valid;
  }
  protected updated() {
    for (const select of this.renderRoot.querySelectorAll<HTMLSelectElement>("select[data-selected]")) {
      if (select.value !== select.dataset.selected) select.value = select.dataset.selected ?? "";
    }
  }
  render(): TemplateResult {
    const c = this.value;
    if (!c) return html`<div class="title">${this.label}</div><button @click=${() => this.emit(defaultCondition("state"))}>${this.t("configure")}${this.optional ? ` · ${this.t("optional")}` : ""}</button>`;
    const kinds = this.stateOnly ? ["state"] : ["state", "numeric", "and", "or", "not", "time", ...(!this.externalOnly ? ["room", "fact", "home_mode"] : [])];
    return html`${this.label ? html`<div class="title">${this.label}</div>` : nothing}<div class="condition">
      <div class="top">${this.select("kind", c.type, kinds.map(key => [key, this.t(key)]), value => this.emit(defaultCondition(value as Condition["type"])))}${this.optional ? html`<button class="link" @click=${() => this.emit(null)}>${this.t("remove")}</button>` : nothing}</div>
      ${this.body(c)}
      <details><summary class="sub">${this.t("continuous")}</summary>${this.number("continuous", c.for ?? 0, value => this.patch({ for: value ?? 0 }), false, 0)}</details>
    </div>`;
  }
  private body(c: Condition): TemplateResult {
    if (c.type === "and" || c.type === "or" || c.type === "not") {
      const children = c.type === "not" ? [c.condition!] : c.conditions!;
      return html`${children.map((child, i) => html`<div class="child"><hapo-condition .value=${child} .entities=${this.entities} .config=${this.config} .locale=${this.locale} .externalOnly=${this.externalOnly} .optional=${c.type !== "not" && children.length > 1} @condition-changed=${(e: CustomEvent) => { e.stopPropagation(); if (c.type === "not") this.patch({ condition: e.detail.value }); else { const values = [...children]; if (e.detail.value) values[i] = e.detail.value; else values.splice(i, 1); this.patch({ conditions: values }); } }}></hapo-condition></div>`)}${c.type !== "not" ? html`<button class="link" @click=${() => this.patch({ conditions: [...children, defaultCondition("state")] })}>+ ${this.t("addCondition")}</button>` : nothing}`;
    }
    if (c.type === "state" || c.type === "numeric") {
      const entity = this.entities.find(e => e.entity_id === c.entity_id);
      return html`<hapo-entity-picker .entities=${this.entities} .value=${c.entity_id ?? ""} .currentValue=${entity?.state} .locale=${this.locale} .label=${this.t("entity")} required @entity-changed=${(e: CustomEvent) => { e.stopPropagation(); this.patch({ entity_id: e.detail.value ?? "" }); }}></hapo-entity-picker>
        ${c.type === "state" ? this.text("activeStates", c.states?.join(", ") ?? "", value => this.patch({ states: value.split(",").map(s => s.trim()).filter(Boolean) }), true) : html`<div class="fields">${this.number("above", c.above, value => { const next = { ...c }; if (value === undefined) delete next.above; else next.above = value; this.emit(next); }, true)}${this.number("below", c.below, value => { const next = { ...c }; if (value === undefined) delete next.below; else next.below = value; this.emit(next); }, true)}</div>${entity?.unit ? html`<small>${entity.unit}</small>` : nothing}${this.number("hysteresis", c.hysteresis ?? 0, value => this.patch({ hysteresis: value ?? 0 }), false, 0)}`}
        <details><summary class="sub">${this.t("attribute")}</summary>${this.text("attribute", c.attribute ?? "", value => this.patch({ attribute: value }))}</details>`;
    }
    if (c.type === "room") return html`${this.select("room", c.room_id ?? "", Object.values(this.config?.rooms ?? {}).map(room => [room.id, room.name || room.area_id || room.id]), value => this.patch({ room_id: value }))}${this.select("state", c.occupied ? "on" : "off", [["on", this.t("occupied")], ["off", this.t("clear")]], value => this.patch({ occupied: value === "on" }))}`;
    if (c.type === "home_mode") return html`${this.select("mode", c.mode_id ?? "", (this.config?.home.modes ?? []).map(mode => [mode.id, mode.name || this.t(mode.id)]), value => this.patch({ mode_id: value }))}`;
    if (c.type === "time") return html`<div class="fields">${["after", "before"].map(key => html`<label>${this.t(key)}<input type="time" required .value=${c[key as "after"] ?? ""} @input=${(e: Event) => this.patch({ [key]: (e.target as HTMLInputElement).value })}></label>`)}</div>`;
    const facts = ["occupied", "present_count", "awake_count", "sleeping_count", "counts_known", "guests", "any_sleeping", "all_sleeping"];
    const isCount = c.key?.endsWith("_count");
    return html`${this.select("key", c.key ?? "occupied", facts.map(key => [key, this.t(key)]), key => this.patch({ key, op: "eq", value: key.endsWith("_count") ? 0 : true }))}<div class="fields">${this.select("operator", c.op ?? "eq", (isCount ? ["eq", "ne", "gt", "gte", "lt", "lte"] : ["eq", "ne"]).map(key => [key, this.t(key)]), op => this.patch({ op }))}${isCount ? this.number("value", Number(c.value), value => this.patch({ value: value ?? 0 }), false, 0) : this.select("value", c.value ? "true" : "false", [["true", this.t("yes")], ["false", this.t("no")]], value => this.patch({ value: value === "true" }))}</div>`;
  }
}
customElements.define("hapo-condition", HapoCondition);
