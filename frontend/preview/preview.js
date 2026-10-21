import "./icons.js";
import { createMockHass } from "./fixtures.js";
import "/hapo-panel.js";

const params = new URLSearchParams(location.search);
const language = params.get("lang") === "fr" ? "fr" : "en";
const theme = params.get("theme") === "light" ? "light" : "dark";
document.documentElement.lang = language;
document.documentElement.dataset.theme = theme;
document.title = "Hapo — Home Assistant Presence Orchestrator (local preview)";

const { hass, getSnapshot } = createMockHass(language, theme === "dark");
const panel = document.createElement("hapo-panel");
const resize = () => {
  panel.narrow = matchMedia("(max-width: 870px)").matches;
  panel.hass = { ...hass, narrow: panel.narrow };
};
try {
  // Reloading restores the same fixture instead of a draft from an earlier capture.
  sessionStorage.removeItem(`hapo.draft.hapo-local-preview-${language}.preview-user`);
} catch { /* The panel also works when browser storage is disabled. */ }
resize();
document.body.append(panel);
window.addEventListener("resize", resize);

// Optional deterministic entry points for README screenshots. These assign only
// local UI state; the normal app never depends on this preview-only mechanism.
await panel.updateComplete;
while (!panel.snapshot) await new Promise((resolve) => setTimeout(resolve, 10));
const view = params.get("view");
if (["rooms", "residents", "home"].includes(view)) panel.view = view;
const room = params.get("room");
if (room && getSnapshot().config.rooms[room]) {
  panel.view = "rooms";
  panel.selectedRoom = room;
}
const tab = params.get("tab");
if (["presence", "detection", "timing", "context", "settings"].includes(tab)) panel.roomSection = tab;
const resident = params.get("resident");
if (resident && getSnapshot().config.residents[resident]) {
  panel.view = "residents";
  panel.selectedResident = resident;
}
panel.requestUpdate();
await panel.updateComplete;
document.documentElement.dataset.previewReady = "true";
window.hapoPreview = Object.freeze({ getSnapshot, panel, hass });
