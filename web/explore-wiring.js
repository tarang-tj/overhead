// v2 wiring between the UI (search, card, location, time, filter, identify)
// and the renderer. Kept out of main.js so the entry stays small. Every
// renderer call is optional-chained: a missing 3D view degrades, never throws.
import { UWB } from "./orbit/sky.js";

const BUILT_NEAR = { leo: "Kirkland", starlink: "Redmond" };

/** Search index for the UI: [{ noradId, name, category }]. */
export function buildSatIndex(sats) {
  return sats.map((s) => ({ noradId: s.noradId, name: s.name, category: s.category || "other" }));
}

/**
 * Callbacks for mountUi plus the canvas pick handler.
 * `ctx` holds { renderer, ui, horizon, satcat, satsById } and is read lazily
 * because the UI is mounted after these callbacks are created.
 */
export function exploreCallbacks(ctx) {
  let observer = UWB;
  let press = null;
  const look = { az: 0, el: 25 };

  async function getSatInfo(noradId) {
    const sat = ctx.satsById.get(noradId);
    if (!sat) return null;
    const row = ctx.satcat?.rows?.[noradId] || [];
    const owners = ctx.satcat?.owners || {};
    const r = ctx.renderer;
    const from = r?.simTime?.() ?? new Date();
    let nextPass;
    try {
      nextPass = r?.requestNextPass ? await r.requestNextPass(noradId, observer, from) : undefined;
    } catch {
      nextPass = undefined; // "Next pass unavailable" in the card
    }
    return {
      noradId,
      name: sat.name,
      category: sat.category || "other",
      ownerName: row[0] ? owners[row[0]] || row[0] : null,
      launchDate: row[1] || null,
      launchSite: row[2] || null,
      intlDes: row[3] || null,
      state: r?.satState?.(noradId) ?? null,
      nextPass,
      builtNearUwb: BUILT_NEAR[sat.category] || null,
    };
  }

  const api = {
    getSatInfo,
    observer: () => observer,
    onLook(az, el, unc) {
      look.az = az;
      look.el = el;
      ctx.renderer?.setLook(az, el, unc);
    },
    onIdentify() {
      return ctx.renderer?.identifyAt?.(look.az, look.el, 5) ?? [];
    },
    onLocation(obs) {
      observer = obs || UWB;
      // The terrain horizon exists only for UW Bothell; elsewhere it is flat (and labeled).
      ctx.renderer?.setObserver?.(observer, obs ? null : ctx.horizon);
      ctx.ui?.setObserverLabel?.(obs ? "over your location" : "over UW Bothell");
    },
    onTime(date) {
      ctx.renderer?.setTime?.(date);
    },
    onSpeed(x) {
      ctx.renderer?.setSpeed?.(x);
    },
    onFilter(keys) {
      ctx.renderer?.setCategoryFilter?.(keys);
    },
    onSelect(noradId) {
      ctx.renderer?.highlight(noradId);
    },
    /** Remember where a press started, so a drag (orbit rotate) is not treated as a tap. */
    onPointerDown(ev) {
      press = { x: ev.clientX, y: ev.clientY };
    },
    /** Canvas click: pick the nearest satellite, highlight it and open its card. Drags are ignored. */
    onCanvasClick(ev) {
      if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 5) return;
      pickAndOpen(ev.clientX, ev.clientY);
    },
    /** Tap forwarded from the Look Up drag layer (it covers the canvas). */
    onSkyTap(x, y) {
      pickAndOpen(x, y);
    },
    getSatState: (id) => ctx.renderer?.satState?.(id) ?? null,
    /** Tonight's pass list is computed for UW Bothell, so its sky always shows UW Bothell. */
    onModeChange(mode) {
      const want = mode === "tonight" ? UWB : observer;
      ctx.renderer?.setObserver?.(want, want === UWB ? ctx.horizon : null);
    },
  };
  return api;
  function pickAndOpen(x, y) {
    const id = ctx.renderer?.pickAt?.(x, y);
    if (id == null) return;
    ctx.renderer.highlight(id);
    ctx.ui?.showCard?.(id);
  }
}
