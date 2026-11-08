// Per-sweep sky census for one observer: which satellites are above the horizon
// (terrain profile or flat 0 deg), per category, and how many could be seen now.
import { enuBasisEci, observerEci, horizonAt } from "./frames.js";
import { CATEGORY_KEYS } from "./categories.js";

const D2R = Math.PI / 180;
export const SEEABLE_MIN_EL_DEG = 10;
export const SEEABLE_SUN_DEG = -6;

/**
 * positions: ECI km Float32Array(3n); flags: 0 sunlit, 1 shadow, 2 invalid; catIdx: category index per sat.
 * `profile` null means a flat 0 deg horizon. seeableNow = sunlit, el >= 10, observer's sun <= -6 deg.
 * onVisible(i) is called for every satellite above the horizon.
 */
export function scanSky({ positions, flags, catIdx, date, obs, profile, sunElDeg }, onVisible = null) {
  const basis = enuBasisEci(obs.latDeg, obs.lonDeg, date);
  const o = observerEci(obs.latDeg, obs.lonDeg, obs.heightKm ?? 0, date);
  const counts = new Array(CATEGORY_KEYS.length).fill(0);
  const dark = sunElDeg <= SEEABLE_SUN_DEG;
  let seeable = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === 2) continue;
    const dx = positions[3 * i] - o.x, dy = positions[3 * i + 1] - o.y, dz = positions[3 * i + 2] - o.z;
    const up = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
    if (up <= 0) continue;
    const el = Math.asin(up / Math.hypot(dx, dy, dz)) / D2R;
    if (profile) {
      const e = dx * basis.east.x + dy * basis.east.y + dz * basis.east.z;
      const n = dx * basis.north.x + dy * basis.north.y + dz * basis.north.z;
      if (el < horizonAt(profile, ((Math.atan2(e, n) / D2R) % 360 + 360) % 360)) continue;
    }
    counts[catIdx[i]]++;
    if (dark && flags[i] === 0 && el >= SEEABLE_MIN_EL_DEG) seeable++;
    if (onVisible) onVisible(i);
  }
  return {
    byCategory: Object.fromEntries(CATEGORY_KEYS.map((k, i) => [k, counts[i]])),
    seeable,
  };
}
