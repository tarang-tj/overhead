// OVERHEAD UI shell: header, data-age badge, panels, bottom tabs.
import { h, empty } from "./dom.js";
import { formatLocalDate } from "./format.js";
import { ageSince } from "./line-model.js";
import { renderLinePanel } from "./line-panel.js";
import { renderTonightPanel } from "./tonight-panel.js";
import { mountLookControls } from "./lookup-controls.js";

export const SUBTITLE = "Every Amazon Leo and Starlink satellite over UW Bothell, and the line that put it there.";
const TABS = [["orbit", "Orbit"], ["line", "The Line"], ["lookup", "Look Up"], ["tonight", "Tonight"]];

export function badgeText(gpMeta, now = Date.now()) {
  if (!gpMeta || !gpMeta.fetchedAt) return "Orbit data age unknown";
  if (gpMeta.mode === "snapshot") return `Saved snapshot from ${formatLocalDate(gpMeta.fetchedAt)}`;
  const cached = gpMeta.mode === "cache" ? " (cached)" : "";
  const age = ageSince(gpMeta.fetchedAt, now);
  return age === "just now"
    ? `Orbit data from CelesTrak${cached}, updated just now`
    : `Orbit data from CelesTrak${cached}, ${age} old`;
}

export function mountUi({ root, line, passes, horizon, gpMeta, onMode, onLook, onHighlight, onColorMode, getStats }) {
  const tonightState = { showAll: false };
  const badge = h("p", { class: "badge", role: "status" }, badgeText(gpMeta));
  const stats = h("p", { class: "stats muted" });
  const replay = h("button", { type: "button", class: "btn ghost", onclick: () => onMode("zoom") }, "Replay intro");
  const linePanel = h("section", { class: "panel", id: "panel-line", role: "tabpanel", "aria-labelledby": "tab-line", hidden: true });
  const tonightPanel = h("section", { class: "panel", id: "panel-tonight", role: "tabpanel", "aria-labelledby": "tab-tonight", hidden: true });
  const lookPanel = h("section", { class: "panel small", id: "panel-lookup", role: "tabpanel", "aria-labelledby": "tab-lookup", hidden: true });
  const surface = h("div", { class: "look-surface", "aria-hidden": "true" });
  const panels = { line: linePanel, tonight: tonightPanel, lookup: lookPanel };

  const buttons = TABS.map(([id, label]) => h("button", {
    type: "button", role: "tab", id: `tab-${id}`, "data-mode": id, "aria-selected": "false", tabindex: "-1",
    "aria-controls": id === "orbit" ? null : `panel-${id}`, onclick: () => select(id, true),
  }, label));
  const tabbar = h("nav", { class: "tabbar", role: "tablist", "aria-label": "Views", onkeydown: (e) => {
    const i = buttons.findIndex((b) => b === document.activeElement);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (next === undefined || i < 0) return;
    e.preventDefault();
    const b = buttons[(next + buttons.length) % buttons.length];
    b.focus();
    select(b.dataset.mode, true);
  } }, buttons, replay);

  const lineApi = renderLinePanel(linePanel, line, { onColorMode: (m) => onColorMode?.(m) });
  renderTonightPanel(tonightPanel, passes, { onHighlight: (id) => onHighlight(id), state: tonightState });
  const look = mountLookControls({ surface, panel: lookPanel, onLook });

  root.classList.add("overhead-ui");
  root.append(
    h("header", { class: "top" }, h("h1", {}, "OVERHEAD"), h("p", { class: "subtitle" }, SUBTITLE), badge, stats),
    surface, linePanel, lookPanel, tonightPanel, tabbar);

  function paint(m) {
    for (const b of buttons) {
      const on = b.dataset.mode === m;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on || (m === "zoom" && b === buttons[0]) ? 0 : -1;
    }
    for (const [k, el] of Object.entries(panels)) el.hidden = k !== m;
    look.setActive(m === "lookup");
    lineApi.setColorMode(m === "line" ? "stage" : "constellation");
    root.dataset.mode = m;
  }
  function select(m, notify) { paint(m); if (notify) onMode(m); if (m !== "tonight") onHighlight(null); }
  // "zoom" is the cold open: no tab is selected and no panel shows.
  const setMode = (m) => { if (m === "zoom") { paint("zoom"); return; } paint(m); };
  paint("orbit");

  const setStats = (s) => {
    if (!s) return;
    const v = s.visibleAboveHorizon;
    stats.textContent = `${(s.propagated ?? 0).toLocaleString("en-US")} satellites tracked` +
      (v ? `, ${v.leo} Amazon Leo and ${v.starlink} Starlink above the horizon` : "");
  };
  setStats(getStats?.());
  const ageTimer = setInterval(() => { badge.textContent = badgeText(gpMeta); }, 60000);

  return {
    setMode, setStats,
    dispose() { clearInterval(ageTimer); look.dispose(); empty(root); root.classList.remove("overhead-ui"); },
  };
}
