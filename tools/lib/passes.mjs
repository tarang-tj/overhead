// Pass detection: step through a window, group contiguous samples >= minEl.
import { json2satrec } from "satellite.js";
import {
  UWB, canBeSeen, eciAt, isSunlit, lookAngles, sunElevationDeg, sunEciUnit,
} from "../../web/orbit/sky.js";

/** Sun state per sample time, computed once and shared by every satellite. */
export function sunTimeline(times, obs = UWB) {
  return times.map((t) => ({ unit: sunEciUnit(t), elDeg: sunElevationDeg(t, obs) }));
}

/** Passes for one satrec over `times` (Date[]), `sun` from sunTimeline. */
export function findPasses(satrec, times, sun, { minElDeg = 10, obs = UWB } = {}) {
  const passes = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    // Visible if ANY sample is seeable: evening passes often enter Earth's
    // shadow before their peak, so judging only the peak undercounts.
    cur.visible = Boolean(cur.visibleStart);
    delete cur.peakIdx;
    passes.push(cur);
    cur = null;
  };
  for (let i = 0; i < times.length; i++) {
    const eci = eciAt(satrec, times[i]);
    const la = eci ? lookAngles(eci, times[i], obs) : null;
    if (!la || la.elDeg < minElDeg) { close(); continue; }
    if (!cur) {
      cur = { start: times[i].toISOString(), startAzDeg: la.azDeg, peakElDeg: -Infinity, clippedStart: i === 0 };
    }
    const sunlit = isSunlit(eci, sun[i].unit);
    if (canBeSeen({ elDeg: la.elDeg, sunlit, sunElDeg: sun[i].elDeg }, minElDeg)) {
      cur.visibleStart ??= times[i].toISOString();
      cur.visibleEnd = times[i].toISOString();
    }
    if (la.elDeg > cur.peakElDeg) {
      cur.peakElDeg = la.elDeg;
      cur.peakAzDeg = la.azDeg;
      cur.peak = times[i].toISOString();
      cur.peakIdx = i;
    }
    cur.end = times[i].toISOString();
    cur.endAzDeg = la.azDeg;
  }
  if (cur) cur.clippedEnd = true;
  close();
  return passes;
}

export function makeTimes(start, hours, stepSec) {
  const n = Math.floor((hours * 3600) / stepSec) + 1;
  return Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * stepSec * 1000));
}

export function satrecOrNull(omm) {
  try { return json2satrec(omm); } catch { return null; }
}
