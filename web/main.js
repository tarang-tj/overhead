// OVERHEAD entry: load data (live orbits + pipeline files), start the
// renderer and the UI, play the intro zoom, then hand control to the tabs.
// Every input is optional: a missing file degrades one panel, never the app.
import { loadGp } from "./live/gp-source.js";
import { buildSatIndex, exploreCallbacks } from "./explore-wiring.js";

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { ready: false, mode: "zoom", gpMeta: null, renderer: null, ui: null, errors: [] };
window.__oh = state;

async function loadJson(path) {
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[main] ${path} unavailable: ${err?.message || err}`);
    return null;
  }
}

async function startRenderer(canvas, sats, horizon, line) {
  try {
    const { createOverheadRenderer } = await import("./render/renderer.js");
    return await createOverheadRenderer({ canvas, sats, horizon, line });
  } catch (err) {
    console.warn(`[main] 3D view unavailable: ${err?.message || err}`);
    state.errors.push(String(err?.message || err));
    document.body.classList.add("no-webgl");
    return null;
  }
}

/** Median element epoch (ISO): the accuracy clock for time travel, not the download time. */
function medianEpoch(sats) {
  const t = sats.map((x) => Date.parse(`${x.omm?.EPOCH}Z`)).filter(Number.isFinite).sort((a, b) => a - b);
  return t.length ? new Date(t[Math.floor(t.length / 2)]).toISOString() : null;
}

function setMode(mode) {
  state.mode = mode;
  state.ui?.setMode(mode);
  if (!state.renderer) return;
  if (mode === "zoom") {
    state.renderer.setMode("zoom");
    state.renderer.playZoom().then(() => {
      if (state.mode === "zoom") setMode("orbit");
    });
    return;
  }
  state.renderer.skipZoom?.();
  state.explore?.onModeChange(mode);
  state.renderer.setColorMode(mode === "line" ? "stage" : "constellation");
  state.renderer.setMode(mode === "line" ? "orbit" : mode);
}

async function boot() {
  const canvas = document.getElementById("scene");
  const categories = await loadJson("web/data/categories.json");
  const [gp, line, passes, horizon, satcat] = await Promise.all([
    loadGp({ categories }),
    loadJson("web/data/line.json"),
    loadJson("web/data/passes.json"),
    loadJson("web/data/horizon.json"),
    loadJson("web/data/satcat-lite.json"),
  ]);
  state.gpMeta = { mode: gp.mode, fetchedAt: gp.fetchedAt, count: gp.sats.length, epochAt: medianEpoch(gp.sats) };
  state.renderer = await startRenderer(canvas, gp.sats, horizon, line);

  const ctx = { renderer: state.renderer, ui: null, horizon, satcat, satsById: new Map(gp.sats.map((x) => [x.noradId, x])) };
  const explore = exploreCallbacks(ctx);
  const { mountUi } = await import("./ui/ui.js");
  state.ui = ctx.ui = mountUi({
    root: document.getElementById("ui-root"),
    line, passes, horizon, gpMeta: state.gpMeta,
    onMode: setMode,
    onLook: explore.onLook,
    onHighlight: (id) => state.renderer?.highlight(id),
    onColorMode: (m) => state.renderer?.setColorMode(m),
    getStats: () => state.renderer?.stats() ?? null,
    satIndex: buildSatIndex(gp.sats),
    onLocation: explore.onLocation, onTime: explore.onTime, onSpeed: explore.onSpeed,
    onFilter: explore.onFilter, onSelect: explore.onSelect,
    getSatInfo: explore.getSatInfo, onIdentify: explore.onIdentify,
    onSkyTap: explore.onSkyTap, getSatState: explore.getSatState,
  });
  canvas.addEventListener("pointerdown", explore.onPointerDown);
  canvas.addEventListener("click", explore.onCanvasClick);
  state.explore = explore;

  const start = params.get("mode");
  const skipIntro = reducedMotion || (start && start !== "zoom");
  setMode(skipIntro ? start || "orbit" : "zoom");
  state.litFraction = () => state.renderer?.litFraction() ?? 0;
  state.setMode = setMode;
  // Keep the header's live counts in step with the renderer (1 Hz is the propagation rate).
  setInterval(() => {
    const s = state.renderer?.stats();
    if (s) state.ui?.setStats(s);
    const t = state.renderer?.simTime?.();
    if (t) state.ui?.setSimTime?.(t);
  }, 1000);
  state.ready = true;
}

boot().catch((err) => {
  console.warn(`[main] boot failed: ${err?.message || err}`);
  state.errors.push(String(err?.message || err));
  state.ready = true;
});
