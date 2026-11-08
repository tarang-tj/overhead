// Pass detection shared by the Node data pipeline, the worker and the UI.
// Pure and browser-safe: only satellite.js (bare specifier) and ./sky.js.
import { json2satrec } from "satellite.js";
import {
  UWB, canBeSeen, eciAt, isSunlit, lookAngles, sunElevationDeg, sunEciUnit,
} from "./sky.js";

/** Sun state per sample time, computed once and shared by every satellite. */
export function sunTimeline(times, obs = UWB) {
  return times.map((t) => ({ unit: sunEciUnit(t), elDeg: sunElevationDeg(t, obs) }));
}

/**
 * Shared scan. `sunAt(i)` returns { unit, elDeg } and is only called for
 * samples above minEl. With `firstOnly` the scan returns as soon as the first
 * pass closes.
 */
function scan(satrec, times, sunAt, { minElDeg, obs }, firstOnly) {
  const passes = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    // Visible if ANY sample is seeable: evening passes often enter Earth's
    // shadow before their peak, so judging only the peak undercounts.
    cur.visible = Boolean(cur.visibleStart);
    passes.push(cur);
    cur = null;
  };
  for (let i = 0; i < times.length; i++) {
    const eci = eciAt(satrec, times[i]);
    const la = eci ? lookAngles(eci, times[i], obs) : null;
    if (!la || la.elDeg < minElDeg) {
      close();
      if (firstOnly && passes.length) return passes;
      continue;
    }
    if (!cur) {
      cur = { start: times[i].toISOString(), startAzDeg: la.azDeg, peakElDeg: -Infinity, clippedStart: i === 0 };
    }
    const sun = sunAt(i);
    if (canBeSeen({ elDeg: la.elDeg, sunlit: isSunlit(eci, sun.unit), sunElDeg: sun.elDeg }, minElDeg)) {
      cur.visibleStart ??= times[i].toISOString();
      cur.visibleEnd = times[i].toISOString();
    }
    if (la.elDeg > cur.peakElDeg) {
      cur.peakElDeg = la.elDeg;
      cur.peakAzDeg = la.azDeg;
      cur.peak = times[i].toISOString();
    }
    cur.end = times[i].toISOString();
    cur.endAzDeg = la.azDeg;
  }
  if (cur) cur.clippedEnd = true;
  close();
  return passes;
}

/** Passes for one satrec over `times` (Date[]), `sun` from sunTimeline. */
export function findPasses(satrec, times, sun, { minElDeg = 10, obs = UWB } = {}) {
  return scan(satrec, times, (i) => sun[i], { minElDeg, obs }, false);
}

/**
 * First pass at or after `from` within `hours`, or null. Same per-sample
 * visibility as findPasses; sun state is computed lazily and cached, only for
 * samples above minEl.
 */
export function nextPass(satrec, obs, from, { hours = 48, stepSec = 20, minElDeg = 10 } = {}) {
  const times = makeTimes(from, hours, stepSec);
  const cache = new Map();
  const sunAt = (i) => {
    let s = cache.get(i);
    if (!s) { s = { unit: sunEciUnit(times[i]), elDeg: sunElevationDeg(times[i], obs) }; cache.set(i, s); }
    return s;
  };
  return scan(satrec, times, sunAt, { minElDeg, obs }, true)[0] ?? null;
}

export function makeTimes(start, hours, stepSec) {
  const n = Math.floor((hours * 3600) / stepSec) + 1;
  return Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * stepSec * 1000));
}

export function satrecOrNull(omm) {
  try { return json2satrec(omm); } catch { return null; }
}
