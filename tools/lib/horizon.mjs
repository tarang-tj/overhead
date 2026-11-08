// Horizon math. Earth curvature uses the geometric radius (R = 6371 km) and
// ignores atmospheric refraction (it would lift the horizon by ~0.1 deg or less).
export const R_EARTH_KM = 6371;
const RAD = Math.PI / 180;

/** Rays are cast every RAY_STEP_DEG and linearly interpolated to 1 deg (API quota: see build-horizon.mjs). */
export const RAY_STEP_DEG = 2;

/** Sample distances (km) along each ray: dense near campus, sparse far out, to 120 km. */
export function rayDistancesKm() {
  return [1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 30, 36, 43, 51, 60, 72, 86, 102, 120];
}

/** Expand a ring of values sampled every `step` deg to 360 one-degree values (wraps at 360). */
export function interpolateRing(values, step) {
  const out = [];
  for (let az = 0; az < 360; az++) {
    const i = Math.floor(az / step), f = (az - i * step) / step;
    out.push(values[i] * (1 - f) + values[(i + 1) % values.length] * f);
  }
  return out;
}

/** Great-circle destination from (lat, lon) along bearing azDeg for distKm. */
export function destination(latDeg, lonDeg, azDeg, distKm) {
  const f = distKm / R_EARTH_KM, b = azDeg * RAD, p1 = latDeg * RAD, l1 = lonDeg * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(f) + Math.cos(p1) * Math.sin(f) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(f) * Math.cos(p1), Math.cos(f) - Math.sin(p1) * Math.sin(p2));
  return { latDeg: p2 / RAD, lonDeg: ((l2 / RAD + 540) % 360) - 180 };
}

/** Distance (km) and initial bearing (deg) from a to b. */
export function distanceBearing(a, b) {
  const p1 = a.latDeg * RAD, p2 = b.latDeg * RAD, dl = (b.lonDeg - a.lonDeg) * RAD;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const distanceKm = 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { distanceKm, azDeg: ((Math.atan2(y, x) / RAD) + 360) % 360 };
}

/** Elevation angle (deg) of a ground point at distKm with height pointM, seen from eye height obsM. */
export function elevationAngleDeg(distKm, pointM, obsM) {
  const dropM = (distKm * distKm) / (2 * R_EARTH_KM) * 1000;
  return Math.atan2(pointM - obsM - dropM, distKm * 1000) / RAD;
}

/** Horizon angle for one ray: max elevation angle over (distKm, heightM) samples. */
export function rayHorizonDeg(samples, obsM) {
  let best = -90;
  for (const { distKm, heightM } of samples) best = Math.max(best, elevationAngleDeg(distKm, heightM, obsM));
  return best;
}
