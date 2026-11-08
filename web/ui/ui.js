// OVERHEAD UI shell: header, data-age badge, panels, bottom tabs.
import { h, empty } from "./dom.js";
import { formatLocalDate } from "./format.js";
import { ageSince } from "./line-model.js";
import { renderLinePanel } from "./line-panel.js";
import { renderTonightPanel } from "./tonight-panel.js";
import { mountLookControls } from "./lookup-controls.js";
import { DEFAULT_CATEGORIES, headerText, observerLabel, FLAT_HORIZON_NOTE } from "./explore-model.js";
import { mountSearch, mountLocation, mountLegend } from "./explore-panel.js";
import { mountTimeBar } from "./time-bar.js";
import { mountCard, mountIdentify } from "./card-panel.js";

export const SUBTITLE = "Every active satellite over you, now or any time you pick.";
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

export function mountUi({
  root, line, passes, horizon, gpMeta, onMode, onLook, onHighlight, onColorMode, getStats,
  satIndex, categories = DEFAULT_CATEGORIES, onLocation, onTime, onSpeed, onFilter, onSelect, getSatInfo, getSatState, onIdentify, onSkyTap,
}) {
  const tonightState = { showAll: false };
  const badge = h("p", { class: "badge", role: "status" }, badgeText(gpMeta));
  const stats = h("p", { class: "stats muted" });
  const observerLine = h("p", { class: "observer muted" }, observerLabel(false));
  let youLabel = false, labelOverride = null, simDate = null, lastStats = null;
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
  const look = mountLookControls({ surface, panel: lookPanel, onLook, onSkyTap });

  // v2 pieces mount only when the caller supplies their callbacks, so v1 callers keep working.
  const nameOf = new Map((satIndex || []).map((s) => [s.noradId, s]));
  const search = satIndex && onSelect ? mountSearch({ satIndex, onSelect: (id) => pick(id) }) : null;
  const loc = onLocation ? mountLocation({
    onLocation: (obs) => { onLocation(obs); }, onState: (isYou) => { youLabel = isYou; labelOverride = null; paintObserver(); if (lastStats) setStats(lastStats); } }) : null;
  const legend = onFilter ? mountLegend({ categories, onFilter }) : null;
  const timeBar = onTime ? mountTimeBar({ gpMeta, onTime, onSpeed }) : null;
  const card = getSatInfo ? mountCard({ satIndex, categories, getSatInfo, getSatState, onShowInSky: (az, el) => { select("lookup", true); look.lookAt(az, el); } }) : null;
  if (onIdentify) {
    lookPanel.append(mountIdentify({ onIdentify, nameOf: (id) => nameOf.get(id)?.name, categoryOf: (id) => nameOf.get(id)?.category,
      categories, onPick: (id) => pick(id) }));
  }
  function openCard(id) { if (card) card.show(id); }
  // Search, chips and identify rows behave like a canvas click: highlight, then open the card.
  function pick(id) { onSelect?.(id); openCard(id); }
  function paintObserver() {
    observerLine.textContent = (labelOverride || observerLabel(youLabel)) + (youLabel ? `. ${FLAT_HORIZON_NOTE}` : "");
  }

  root.classList.add("overhead-ui");
  root.append(...[
    h("header", { class: "top" }, h("h1", {}, "OVERHEAD"), h("p", { class: "subtitle" }, SUBTITLE), badge, stats,
      loc || legend || search ? observerLine : null,
      loc || search ? h("div", { class: "explore" }, search, loc?.el) : null, loc?.msg, legend?.el),
    surface, linePanel, lookPanel, tonightPanel, card?.el, timeBar?.el, tabbar].filter(Boolean));
  if (timeBar) root.classList.add("has-timebar");

  function paint(m) {
    // Switching views closes an open satellite card so it never covers the new panel.
    if (card?.isOpen?.() && root.dataset.mode && root.dataset.mode !== m) card.close();
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
  function select(m, notify) { card?.close(); paint(m); if (notify) onMode(m); if (m !== "tonight") onHighlight(null); }
  // "zoom" is the cold open: no tab is selected and no panel shows.
  const setMode = (m) => { if (m === "zoom") { paint("zoom"); return; } paint(m); };
  paint("orbit");

  const setStats = (s) => {
    if (!s) return;
    lastStats = s;
    legend?.setCounts(s.aboveHorizonByCategory);
    const head = headerText(s, { you: youLabel, simDate });
    if (head) { stats.textContent = head; return; }
    const v = s.visibleAboveHorizon;
    stats.textContent = `${(s.propagated ?? 0).toLocaleString("en-US")} satellites tracked` +
      (v ? `, ${v.leo} Amazon Leo and ${v.starlink} Starlink above the horizon` : "");
  };
  setStats(getStats?.());
  const ageTimer = setInterval(() => { badge.textContent = badgeText(gpMeta); }, 60000);

  return {
    setMode, setStats,
    showCard: openCard,
    setObserverLabel(text) { labelOverride = text || null; paintObserver(); },
    setSimTime(date) { simDate = date || null; timeBar?.setSimTime(date); },
    dispose() { clearInterval(ageTimer); look.dispose(); empty(root); root.classList.remove("overhead-ui"); },
  };
}
