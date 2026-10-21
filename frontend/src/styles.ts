import { css } from "lit";

/** Shared controls inherit the active Home Assistant theme across shadow roots. */
export const controls = css`
  :host {
    --hapo-bg: var(--primary-background-color, Canvas);
    --hapo-surface: var(--ha-card-background, var(--card-background-color, var(--hapo-bg)));
    --hapo-muted-bg: var(--secondary-background-color, var(--hapo-surface));
    --hapo-text: var(--primary-text-color, CanvasText);
    --hapo-secondary: var(--secondary-text-color, var(--hapo-text));
    --hapo-line: var(--divider-color, var(--outline-color, GrayText));
    --hapo-accent: var(--primary-color, Highlight);
    --hapo-on-accent: var(--text-primary-color, HighlightText);
    --hapo-selected: color-mix(in srgb, var(--hapo-accent) 10%, var(--hapo-surface));
    --hapo-control-radius: var(--ha-border-radius-md, 8px);
    --hapo-fast: var(--ha-animation-duration-fast, 150ms);
  }
  * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb-color,var(--hapo-line)) transparent; }
  [hidden] { display: none !important; }
  ::selection { background: var(--hapo-accent); color: var(--hapo-on-accent); }
  :focus-visible { outline: 2px solid var(--hapo-accent); outline-offset: 3px; }
  input,select,textarea,button { font: inherit; }
  input,select,textarea {
    min-width: 0; width: 100%; min-height: 38px; padding: 7px 10px;
    border: 1px solid var(--input-outlined-idle-border-color,var(--hapo-line));
    border-radius: var(--hapo-control-radius); background: var(--input-fill-color,var(--hapo-surface));
    color: var(--input-ink-color,var(--hapo-text)); caret-color: var(--hapo-accent);
  }
  input:hover,select:hover,textarea:hover { border-color: var(--input-outlined-hover-border-color,var(--hapo-secondary)); }
  input::placeholder,textarea::placeholder { color: var(--input-label-ink-color,var(--hapo-secondary)); opacity: 1; }
  input[type="checkbox"] { width: 18px; height: 18px; min-height: 18px; padding: 0; flex-shrink: 0; accent-color: var(--hapo-accent); }
  input:invalid { border-color: var(--error-color,var(--hapo-text)); }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; max-width: 100%;
    padding: 7px 12px; border: 1px solid var(--outline-color,var(--hapo-line)); border-radius: var(--hapo-control-radius);
    background: var(--hapo-surface); color: var(--hapo-text); cursor: pointer; line-height: 1.4;
    transition: background-color var(--hapo-fast),color var(--hapo-fast),border-color var(--hapo-fast);
  }
  button:hover:not(:disabled) { background: var(--hapo-muted-bg); border-color: var(--outline-hover-color,var(--hapo-secondary)); }
  button:active:not(:disabled) { background: var(--hapo-selected); }
  button.primary { background: var(--hapo-accent); color: var(--hapo-on-accent); border-color: transparent; }
  button.primary:hover:not(:disabled) { background: var(--hapo-accent); filter: brightness(.94); }
  button:disabled { color: var(--disabled-text-color,var(--hapo-secondary)); cursor: default; }
  button.primary:disabled { background: var(--hapo-muted-bg); border-color: var(--hapo-line); filter: none; }
  button.link { border-color: transparent; background: transparent; color: var(--hapo-accent); }
  button.danger,.danger { color: var(--error-color,var(--hapo-text)); }
  label { display: flex; flex-direction: column; gap: 6px; font-size: var(--ha-font-size-m,14px); margin: 8px 0; min-width: 0; }
  label.check { flex-direction: row; align-items: center; gap: 10px; min-height: 32px; cursor: pointer; }
  .fields,.field-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,200px),1fr)); gap: var(--ha-space-2,8px) var(--ha-space-4,16px); }
  .field-grid > label:not(.check),.field-grid > hapo-entity-picker { display: grid; grid-row: span 2; grid-template-rows: subgrid; row-gap: 6px; align-items: start; }
  .field-grid > hapo-entity-picker::part(control) { margin-top: 0; }
  .actions { display: flex; align-items: center; gap: var(--ha-space-2,8px); flex-wrap: wrap; }
  .hint,.help,small { color: var(--hapo-secondary); line-height: 1.55; }
  .hint,.help { max-width: 75ch; }
  .hint { margin: 6px 0 12px; }
  small { font-size: var(--ha-font-size-s,12px); }
  details { min-width: 0; }
  summary { cursor: pointer; font-weight: var(--ha-font-weight-medium,500); min-height: 36px; padding: 6px 0; }
  details[open] > summary { margin-bottom: 12px; }
  @media (pointer:coarse) {
    button,input,select,textarea,summary { min-height: 44px; }
    input[type="checkbox"] { min-height: 20px; width: 20px; height: 20px; }
  }
  @media (prefers-reduced-motion:reduce) {
    *,*::before,*::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }
`;

/** The panel uses Halo's navigation, room rail, spacing and flat editing surface. */
export const panelStyles = [controls, css`
  :host {
    display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden;
    color: var(--hapo-text); background: var(--hapo-bg); color-scheme: inherit;
    font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, inherit));
    font-size: var(--ha-font-size-m,14px); line-height: var(--ha-line-height-normal,1.6);
    font-weight: var(--ha-font-weight-normal,400);
  }
  .app-header {
    display: flex; align-items: center; gap: var(--ha-space-6,24px); min-height: 60px;
    padding: 0 var(--ha-space-5,20px); flex-shrink: 0; z-index: 3;
    background: var(--app-header-background-color,var(--hapo-surface));
    color: var(--app-header-text-color,var(--hapo-text));
    border-bottom: var(--app-header-border-bottom,1px solid var(--hapo-line));
  }
  .brand { display: flex; align-items: center; gap: var(--ha-space-3,12px); flex-shrink: 0; }
  .brand h1 { font-size: var(--ha-font-size-xl,20px); margin: 0; letter-spacing: -.02em; }
  .brand small { display: none; }
  ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; display: inline-flex; flex-shrink: 0; color: currentColor; }
  .brand ha-icon,.brand .mark { --mdc-icon-size: 24px; width: 24px; height: 24px; }
  h1,h2,h3,h4 { font-family: var(--ha-font-family-heading,var(--ha-font-family-body,inherit)); font-weight: var(--ha-font-weight-bold,700); line-height: var(--ha-line-height-condensed,1.2); overflow-wrap: anywhere; }
  h2 { font-size: var(--ha-font-size-xl,20px); margin: 0; }
  h3 { font-size: var(--ha-font-size-l,16px); margin: 0 0 var(--ha-space-3,12px); }
  h4 { font-size: var(--ha-font-size-m,14px); margin: 0 0 var(--ha-space-2,8px); }
  p { margin: var(--ha-space-2,8px) 0 var(--ha-space-4,16px); }
  .content { flex: 1; min-height: 0; display: flex; overflow: hidden; }
  main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .row,.section-actions,.room-toolbar { display: flex; align-items: center; gap: var(--ha-space-2,8px); flex-wrap: wrap; }
  .grow { flex: 1; min-width: 0; }
  .top-nav { display: flex; align-self: stretch; gap: var(--ha-space-2,8px); min-width: 0; }
  .top-nav button {
    position: relative; border: 0; border-radius: 0; padding: var(--ha-space-3,12px) var(--ha-space-4,16px);
    background: transparent; color: inherit; font-weight: var(--ha-font-weight-medium,500); white-space: nowrap;
  }
  .top-nav button[aria-current="page"]::after {
    content: ""; position: absolute; inset-inline: var(--ha-space-4,16px); bottom: 0; height: 3px;
    background: currentColor; border-radius: 3px 3px 0 0;
  }
  .top-nav button:hover:not(:disabled) { background: color-mix(in srgb,currentColor 8%,transparent); }
  .workspace,.resident-workspace { display: grid; grid-template-columns: 264px minmax(0,1fr); flex: 1; min-height: 0; }
  .room-rail { min-height: 0; overflow-y: auto; background: var(--hapo-surface); border-inline-end: 1px solid var(--hapo-line); padding: var(--ha-space-4,16px) var(--ha-space-3,12px); }
  .rail-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px 12px; }
  .rail-heading h2 { font-size: var(--ha-font-size-l,16px); }
  .rail-search { margin: 0 4px 12px; }
  .room-list { list-style: none; margin: 0; padding: 0; }
  .room-item { display: flex; align-items: center; gap: 4px; padding: 3px; margin-bottom: 4px; border-radius: var(--hapo-control-radius); min-width: 0; }
  .room-item[data-active] { background: var(--hapo-selected); }
  .room-link { justify-content: flex-start; display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0; text-align: start; border: 0; background: transparent; padding: 10px 8px; }
  .room-link > span { min-width: 0; }
  .room-link strong { display: block; font-weight: var(--ha-font-weight-medium,500); overflow-wrap: anywhere; }
  .room-link .room-meta { display: block; color: var(--hapo-secondary); font-size: var(--ha-font-size-s,12px); line-height: 1.45; overflow-wrap: anywhere; }
  .room-item[data-active] .room-link { color: var(--hapo-accent); }
  .room-item[data-state="on"] .room-link > ha-icon { color: var(--state-binary_sensor-occupancy-on-color,var(--state-active-color,var(--hapo-accent))); }
  .room-item[data-state="unknown"] .room-link > ha-icon { color: var(--warning-color,var(--hapo-secondary)); }
  .room-rail > .actions { padding: 12px 4px 0; }
  .room-detail { min-width: 0; min-height: 0; overflow: auto; padding: var(--ha-space-5,20px) var(--ha-space-6,24px) 32px; scroll-padding: 16px; }
  .room-heading { display: flex; align-items: center; justify-content: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .room-heading .help,.room-heading .hint { margin: 4px 0 0; }
  .room-heading .back-button { display: none; }
  .room-heading h2 { font-size: var(--ha-font-size-2xl,24px); }
  .room-toolbar { margin: 12px 0; justify-content: space-between; row-gap: 12px; }
  .room-modes { display: flex; align-items: center; gap: 20px; margin: 0; }
  .room-modes .check { margin: 0; }
  .room-summary { margin-bottom: 16px; }
  .compact-help { font-size: var(--ha-font-size-s,12px); }
  .rail-add { margin: 12px 4px 0; }
  .badge { display: inline-flex; align-items: center; gap: 5px; font-size: var(--ha-font-size-s,12px); color: var(--hapo-secondary); padding: 2px 0; font-variant-numeric: tabular-nums; }
  .help-details { color: var(--hapo-secondary); margin: 8px 0 16px; }
  .help-details summary { font-size: var(--ha-font-size-s,12px); min-height: 28px; }
  .help-details .help { margin: 0 0 10px; }
  .help-details[open] > summary { margin-bottom: 4px; }
  .source-row { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 10px 0; border-bottom: 1px solid var(--hapo-line); }
  .source-row:last-child { border-bottom: 0; }
  .source-row strong { display: block; font-weight: var(--ha-font-weight-medium,500); }
  .source-row small { display: block; overflow-wrap: anywhere; }
  .source-row > .badge { flex-shrink: 0; }
  .room-tabs { display: flex; gap: 4px; overflow-x: auto; padding: 4px 0; border-bottom: 1px solid var(--hapo-line); margin-bottom: var(--ha-space-5,20px); }
  .room-tabs button { flex-shrink: 0; border: 0; background: transparent; color: var(--hapo-secondary); border-radius: var(--hapo-control-radius); padding: 8px 12px; }
  .room-tabs button[aria-current="page"],.room-tabs button[aria-selected="true"] { color: var(--hapo-accent); background: var(--hapo-selected); font-weight: var(--ha-font-weight-medium,500); }
  .room-panel,section,.card { min-width: 0; }
  .room-panel > section,.room-panel > details,.room-panel > div > section { padding: 0; margin-bottom: 24px; }
  .section-heading { display: flex; align-items: center; gap: 12px; justify-content: space-between; flex-wrap: wrap; margin-bottom: 16px; }
  .section-heading h2 { font-size: var(--ha-font-size-l,16px); }
  .section-heading h3 { margin: 0; }
  .settings-group { padding: 20px 0; border-bottom: 1px solid var(--hapo-line); }
  .settings-group:first-child { padding-top: 0; }
  .section { margin-top: 24px; }
  .count { color: var(--hapo-secondary); font-size: var(--ha-font-size-s,12px); font-variant-numeric: tabular-nums; }
  .danger-zone { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--hapo-line); }
  .icon-button { width: 36px; min-width: 36px; height: 36px; padding: 7px; border-color: transparent; background: transparent; }
  .app-header .sidebar-toggle { width: 48px; min-width: 48px; height: 48px; padding: 12px; flex-shrink: 0; border: 0; border-radius: 50%; color: inherit; }
  .app-header .sidebar-toggle:hover { background: color-mix(in srgb,currentColor 8%,transparent); }
  .status { display: inline-flex; align-items: center; gap: 7px; font-size: var(--ha-font-size-s,12px); color: var(--hapo-secondary); white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--state-inactive-color,var(--disabled-text-color,var(--hapo-secondary))); }
  .status[data-state="on"] .dot { background: var(--state-binary_sensor-occupancy-on-color,var(--state-active-color,var(--hapo-accent))); }
  .status[data-state="unknown"] .dot { background: var(--warning-color,var(--hapo-secondary)); }
  .notice,.error { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; margin: 12px 20px; background: var(--hapo-selected); border: 1px solid var(--hapo-line); border-radius: var(--hapo-control-radius); line-height: 1.5; }
  .error { color: var(--error-color,var(--hapo-text)); background: var(--hapo-surface); }
  .room-detail .notice,.room-detail .error,.global-settings .notice,.global-settings .error { margin: 12px 0; }
  .savebar { flex-shrink: 0; z-index: 4; display: flex; align-items: center; gap: 12px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom,0px)); border-top: 1px solid var(--hapo-line); background: var(--hapo-surface); }
  .savebar .grow { font-size: var(--ha-font-size-m,14px); }
  .savebar small { display: block; }
  .global-settings,.overview { padding: 24px; overflow: auto; flex: 1; min-height: 0; }
  .global-settings > section,.global-settings > .editor,.global-settings > .section-heading,.global-settings > details { max-width: 980px; margin: 0 auto 28px; width: 100%; }
  .global-settings > h2 { max-width: 980px; margin: 0 auto 24px; }
  .editor { min-width: 0; }
  .editor-head,.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .home-banner { padding: 0 0 24px; border-bottom: 1px solid var(--hapo-line); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
  .home-mode { font-size: var(--ha-font-size-2xl,24px); font-weight: var(--ha-font-weight-bold,700); line-height: 1.2; margin-top: 4px; }
  .numbers { display: flex; gap: 30px; }
  .number { font-size: var(--ha-font-size-2xl,24px); display: block; font-variant-numeric: tabular-nums; line-height: 1.2; margin-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,290px),1fr)); gap: var(--ha-space-5,20px); }
  .card { padding: 16px 0; border-bottom: 1px solid var(--hapo-line); }
  .card h3 { margin: 0; }
  .card-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
  .card button.title { border: 0; padding: 0; background: transparent; font-weight: var(--ha-font-weight-medium,500); text-align: start; font-size: var(--ha-font-size-l,16px); }
  .mode-card { padding: 16px 0; border-bottom: 1px solid var(--hapo-line); }
  .mode-card .toolbar { margin-bottom: 12px; }
  .suggestion { padding: 12px 0; border-bottom: 1px solid var(--hapo-line); }
  .suggestion:last-child { border: 0; }
  .suggestion p { margin: 5px 0 10px; }
  .readout { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .empty { padding: 24px 0; color: var(--hapo-secondary); max-width: 65ch; }
  .empty h2,.empty h3 { color: var(--hapo-text); margin-bottom: 12px; }
  .empty-state { padding: 40px 24px; max-width: 520px; margin: 8vh auto 0; }
  .empty-state > ha-icon { --mdc-icon-size: 32px; width: 32px; height: 32px; color: var(--hapo-secondary); margin-bottom: 16px; }
  .empty-state p { color: var(--hapo-secondary); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  @media (max-width:1100px) {
    .workspace,.resident-workspace { grid-template-columns: 224px minmax(0,1fr); }
    .room-detail { padding: 16px 18px 28px; }
    .room-tabs button { padding: 8px 10px; }
  }
  @media (max-width:760px) {
    .app-header { gap: 8px; padding: 8px 12px 0; flex-wrap: wrap; min-height: 52px; }
    .brand { padding-bottom: 8px; gap: 8px; }
    .brand h1 { font-size: var(--ha-font-size-l,16px); }
    .top-nav { margin-inline-start: auto; overflow-x: auto; }
    .top-nav button { padding: 10px 9px; font-size: var(--ha-font-size-s,12px); }
    .workspace,.resident-workspace { display: block; overflow: hidden; }
    .room-rail { height: 100%; border-inline-end: 0; padding: 16px 12px; }
    .workspace:not(.has-selection) .room-detail,.resident-workspace:not(.has-selection) .room-detail { display: none; }
    .workspace.has-selection .room-rail,.resident-workspace.has-selection .room-rail { display: none; }
    .workspace.has-selection .room-detail,.resident-workspace.has-selection .room-detail { display: block; height: 100%; }
    .room-detail { padding: 16px 14px 28px; }
    .room-heading .back-button { display: inline-flex; }
    .room-link { padding: 12px 8px; }
    .room-heading h2 { font-size: var(--ha-font-size-xl,20px); }
    .room-tabs { margin-inline: -14px; padding: 4px 14px 8px; }
    .global-settings,.overview { padding: 20px 14px; }
    .savebar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom,0px)); }
    .savebar .grow { grid-column: 1 / -1; font-size: var(--ha-font-size-s,12px); }
    .savebar .actions { display: contents; }
    .savebar button { min-width: 0; padding: 9px 6px; font-size: var(--ha-font-size-s,12px); }
    .notice,.error { margin: 8px 12px; flex-wrap: wrap; }
    .empty-state { margin-top: 24px; padding: 16px; }
    .numbers { gap: 18px; }
  }
  @media (pointer:coarse) { .icon-button { width: 44px; min-width: 44px; height: 44px; } }
`];
