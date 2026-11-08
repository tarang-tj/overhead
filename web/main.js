// OVERHEAD entry: load data (live orbits + pipeline files), start the
// renderer and the UI, play the intro zoom, then hand control to the tabs.
// Every input is optional: a missing file degrades one panel, never the app.
import { loadGp } from "./live/gp-source.js";

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

async function startRenderer(canvas, sats, horizon) {
  try {
    const { createOverheadRenderer } = await import("./render/renderer.js");
    return await createOverheadRenderer({ canvas, sats, horizon });
  } catch (err) {
    console.warn(`[main] 3D view unavailable: ${err?.message || err}`);
    state.errors.push(String(err?.message || err));
    document.body.classList.add("no-webgl");
    return null;
  }
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
  state.renderer.setMode(mode === "line" ? "orbit" : mode);
}

async function boot() {
  const canvas = document.getElementById("scene");
  const [gp, line, passes, horizon] = await Promise.all([
    loadGp(),
    loadJson("web/data/line.json"),
    loadJson("web/data/passes.json"),
    loadJson("web/data/horizon.json"),
  ]);
  state.gpMeta = { mode: gp.mode, fetchedAt: gp.fetchedAt, count: gp.sats.length };
  state.renderer = await startRenderer(canvas, gp.sats, horizon);

  const { mountUi } = await import("./ui/ui.js");
  state.ui = mountUi({
    root: document.getElementById("ui-root"),
    line, passes, horizon, gpMeta: state.gpMeta,
    onMode: setMode,
    onLook: (az, el, unc) => state.renderer?.setLook(az, el, unc),
    onHighlight: (id) => state.renderer?.highlight(id),
    getStats: () => state.renderer?.stats() ?? null,
  });

  const start = params.get("mode");
  const skipIntro = reducedMotion || (start && start !== "zoom");
  setMode(skipIntro ? start || "orbit" : "zoom");
  state.litFraction = () => state.renderer?.litFraction() ?? 0;
  state.setMode = setMode;
  // Keep the header's live counts in step with the renderer (1 Hz is the propagation rate).
  setInterval(() => {
    const s = state.renderer?.stats();
    if (s) state.ui?.setStats(s);
  }, 1000);
  state.ready = true;
}

boot().catch((err) => {
  console.warn(`[main] boot failed: ${err?.message || err}`);
  state.errors.push(String(err?.message || err));
  state.ready = true;
});
