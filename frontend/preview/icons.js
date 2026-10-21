// Small local stand-in for Home Assistant's ha-icon. Geometry is drawn here;
// no icon library, remote font, or network request is needed for the preview.
const paths = {
  "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
  "menu-open": '<path d="M4 6h12M4 12h10M4 18h12m4-10-4 4 4 4"/>',
  "home": '<path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  "home-account": '<path d="m3 11 9-8 9 8M5 10v10h14V10"/><circle cx="12" cy="11.5" r="2"/><path d="M8.5 19v-2.5a3.5 3.5 0 0 1 7 0V19"/>',
  "home-outline": '<path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  "home-group": '<path d="m3 11 9-8 9 8M5 10v10h14V10"/><circle cx="10" cy="12" r="1.6"/><circle cx="15" cy="13" r="1.3"/><path d="M7 19v-1.5a3 3 0 0 1 6 0V19m0-3a2.4 2.4 0 0 1 4 1.8V19"/>',
  "account": '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 6 0 0 1 16 0v3Z"/>',
  "account-outline": '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 6 0 0 1 16 0v3Z"/>',
  "account-group": '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20v-3a7 5 0 0 1 14 0v3Zm14-7a5 4 0 0 1 6 4v3h-3"/>',
  "account-multiple": '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20v-3a7 5 0 0 1 14 0v3Zm14-7a5 4 0 0 1 6 4v3h-3"/>',
  "account-check": '<circle cx="9" cy="7" r="3"/><path d="M2 20v-3a7 5 0 0 1 13-2m0 3 3 3 5-6"/>',
  "account-off": '<circle cx="10" cy="7" r="3"/><path d="M3 21v-4a7 5 0 0 1 12-3M3 3l18 18"/>',
  "account-off-outline": '<circle cx="10" cy="7" r="3"/><path d="M3 21v-4a7 5 0 0 1 12-3M3 3l18 18"/>',
  "walk": '<circle cx="14" cy="3.5" r="2"/><path d="m9 8 4-2 3 4 4 1m-7-5-3 7 5 3 1 6m-6-9-3 9m3-14-3 4-4 1"/>',
  "motion-sensor": '<circle cx="12" cy="4" r="2"/><path d="m8 9 4-2 3 4 3 1m-6-5-2 7 4 3 1 5m-5-8-3 8M3 4a8 8 0 0 0 0 8m18-8a8 8 0 0 1 0 8"/>',
  "motion-sensor-off": '<circle cx="12" cy="4" r="2"/><path d="m8 9 4-2 3 4m-3-4-2 7 4 3 1 5m-5-8-3 8M3 3l18 18"/>',
  "door": '<path d="M5 21h14M7 21V3h10v18m-3-9h.01"/>',
  "door-closed": '<path d="M5 21h14M7 21V3h10v18m-3-9h.01"/>',
  "door-open": '<path d="M4 21h16M7 21V3h10v18M7 3l7 3v15M11 12h.01"/>',
  "timer-outline": '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l3 2M9 2h6m-3 0v4m6 1 2-2"/>',
  "clock-outline": '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  "cog": '<path d="m10 3-.5 3-2 .8-2.5-1.2L3 9l2.5 1.8v2.4L3 15l2 3.4 2.5-1.2 2 .8.5 3h4l.5-3 2-.8 2.5 1.2 2-3.4-2.5-1.8v-2.4L21 9l-2-3.4-2.5 1.2-2-.8L14 3Z"/><circle cx="12" cy="12" r="3"/>',
  "tune": '<path d="M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10M10 3v6m4 0v6M6 15v6"/>',
  "plus": '<path d="M12 4v16M4 12h16"/>',
  "plus-circle-outline": '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  "magnify": '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  "arrow-left": '<path d="M20 12H4m7-7-7 7 7 7"/>',
  "chevron-left": '<path d="m15 5-7 7 7 7"/>',
  "chevron-right": '<path d="m9 5 7 7-7 7"/>',
  "chevron-down": '<path d="m5 9 7 7 7-7"/>',
  "information-outline": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
  "alert-circle-outline": '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4v.01"/>',
  "alert-outline": '<path d="M12 3 2 21h20ZM12 9v5m0 3v.01"/>',
  "check": '<path d="m4 12 5 5L20 6"/>',
  "check-circle-outline": '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  "close": '<path d="m5 5 14 14M5 19 19 5"/>',
  "power": '<path d="M12 2v9M6 5a9 9 0 1 0 12 0"/>',
  "restart": '<path d="M4 6v6h6m-6 0a8 8 0 1 1 2 6"/>',
  "refresh": '<path d="M4 6v6h6m-6 0a8 8 0 1 1 2 6"/>',
  "lock-outline": '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  "shield-check-outline": '<path d="m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5Z"/><path d="m8 12 3 3 5-6"/>',
  "bee": '<ellipse cx="12" cy="14" rx="5" ry="7"/><path d="M7 12h10M7 16h10M10 7 8 3m6 4 2-4M7 10C0 4 0 17 7 14m10-4c7-6 7 7 0 4"/>',
  "bee-flower": '<ellipse cx="12" cy="14" rx="5" ry="7"/><path d="M7 12h10M7 16h10M10 7 8 3m6 4 2-4M7 10C0 4 0 17 7 14m10-4c7-6 7 7 0 4"/>',
  "eye-outline": '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  "bed": '<path d="M3 5v16m18-8v8M3 17h18M3 9h6v8m0-6h9a3 3 0 0 1 3 3v3"/>',
  "sleep": '<path d="M5 6h6l-6 7h6m3-10h6l-6 7h6m-6 5h6l-6 7h6"/>',
  "weather-night": '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  "weather-sunny": '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  "download": '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  "upload": '<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  "delete-outline": '<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  "pencil": '<path d="m3 21 1-5L17 3l4 4L8 20Zm11-15 4 4"/>',
  "dots-vertical": '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
};

paths.restore = paths.restart;
paths["account-check-outline"] = paths["account-check"];
paths["account-group-outline"] = paths["account-group"];
paths["account-circle-outline"] = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5 18a7 5 0 0 1 14 0"/>';

class PreviewIcon extends HTMLElement {
  static get observedAttributes() { return ["icon"]; }
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  get icon() { return this.getAttribute("icon") ?? ""; }
  set icon(value) { this.setAttribute("icon", value); }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    const name = this.icon.replace(/^mdi:/, "");
    this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);align-items:center;justify-content:center;vertical-align:middle;flex-shrink:0}svg{width:100%;height:100%;display:block}</style><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths["home-account"]}</svg>`;
  }
}
if (!customElements.get("ha-icon")) customElements.define("ha-icon", PreviewIcon);
