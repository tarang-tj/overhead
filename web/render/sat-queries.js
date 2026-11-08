// Pure per-satellite queries at the simulated time: state card numbers and the
// "What's that light?" cone search. satellite.js is imported by the caller's map.
import { eciToGeodetic, gstime, propagate } from "satellite.js";
import { isSunlit, lookAngles, sunEciUnit } from "../orbit/sky.js";
import { horizonAt } from "./frames.js";

const RAD = 180 / Math.PI;

/** Lat/lon/alt/speed/az/el/sunlit of a satrec at `date` for `obs`, or null when SGP4 fails. */
export function stateOf(satrec, date, obs) {
  let pv;
  try { pv = propagate(satrec, date); } catch { return null; }
  const p = pv && pv.position, v = pv && pv.velocity;
  if (!p || !v || !Number.isFinite(p.x) || !Number.isFinite(v.x)) return null;
  const gd = eciToGeodetic(p, gstime(date));
  const la = lookAngles(p, date, obs);
  return {
    latDeg: gd.latitude * RAD,
    lonDeg: ((gd.longitude * RAD + 540) % 360) - 180,
    altKm: gd.height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
    azDeg: la.azDeg, elDeg: la.elDeg,
    sunlit: isSunlit(p, sunEciUnit(date)),
  };
}

/** Angle in degrees between two (az, el) directions. */
export function angularSepDeg(az1, el1, az2, el2) {
  const a1 = az1 / RAD, e1 = el1 / RAD, a2 = az2 / RAD, e2 = el2 / RAD;
  const c = Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos(a1 - a2);
  return Math.acos(Math.min(1, Math.max(-1, c))) * RAD;
}

/**
 * Satellites within `coneDeg` of (azDeg, elDeg), nearest first. `candidates` are
 * indices worth checking exactly (from a coarse pass over the latest sweep);
 * `satrecAt(i)` returns the satrec or null. Exact positions are at `date`.
 */
export function identifyExact(candidates, satrecAt, date, obs, azDeg, elDeg, coneDeg, noradOf, profile = null) {
  const out = [];
  for (const i of candidates) {
    const rec = satrecAt(i);
    const s = rec && stateOf(rec, date, obs);
    if (!s || s.elDeg < 0 || s.elDeg < horizonAt(profile, s.azDeg)) continue; // behind terrain is not visible
    const sep = angularSepDeg(azDeg, elDeg, s.azDeg, s.elDeg);
    if (sep <= coneDeg) out.push({ noradId: noradOf(i), sepDeg: sep, elDeg: s.elDeg, azDeg: s.azDeg, sunlit: s.sunlit });
  }
  return out.sort((a, b) => a.sepDeg - b.sepDeg);
}

/** True when ECI point (x,y,z) is below the local horizon (terrain `profile`, or flat 0 deg when null) seen from `o`. */
export function belowHorizon(o, basis, profile, x, y, z) {
  const dx = x - o.x, dy = y - o.y, dz = z - o.z;
  const u = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
  if (u <= 0) return true;
  if (!profile) return false;
  const e = dx * basis.east.x + dy * basis.east.y + dz * basis.east.z, n = dx * basis.north.x + dy * basis.north.y + dz * basis.north.z;
  const el = Math.asin(u / Math.hypot(dx, dy, dz)) * RAD, az = ((Math.atan2(e, n) * RAD) % 360 + 360) % 360;
  return el < horizonAt(profile, az);
}

/** Coarse candidate pass: indices whose sweep position is within coneDeg + margin of the direction. */
export function coarseCandidates(positions, flags, o, basis, azDeg, elDeg, coneDeg) {
  const az = azDeg / RAD, el = elDeg / RAD;
  const t = { x: Math.sin(az) * Math.cos(el), y: Math.cos(az) * Math.cos(el), z: Math.sin(el) };
  const cosMax = Math.cos(Math.min(Math.PI, coneDeg / RAD));
  const out = [];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === 2) continue;
    const dx = positions[3 * i] - o.x, dy = positions[3 * i + 1] - o.y, dz = positions[3 * i + 2] - o.z;
    const r = Math.hypot(dx, dy, dz);
    const e = dx * basis.east.x + dy * basis.east.y + dz * basis.east.z;
    const n = dx * basis.north.x + dy * basis.north.y + dz * basis.north.z;
    const u = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
    if (u < 0) continue;
    if ((e * t.x + n * t.y + u * t.z) / r >= cosMax) out.push(i);
  }
  return out;
}
