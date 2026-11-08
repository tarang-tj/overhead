// Pure frame math, no three.js. Scene convention: three.js world axes ARE the
// ECI axes (x vernal equinox, z celestial pole), 1 unit = 1 km. The Earth mesh
// group is rotated about +z by GMST, so ECEF -> scene is a z-rotation.
import { gstime, geodeticToEcf, degreesToRadians } from "satellite.js";
import { UWB, EARTH_RADIUS_KM } from "../orbit/sky.js";

export const R_KM = EARTH_RADIUS_KM;
const D2R = Math.PI / 180;

export function gmstRad(date) {
  return gstime(date);
}

/** Geodetic (spherical approx, matches the sphere mesh) -> ECEF km. */
export function geoToEcef(latDeg, lonDeg, altKm = 0) {
  const la = latDeg * D2R, lo = lonDeg * D2R, r = R_KM + altKm;
  return { x: r * Math.cos(la) * Math.cos(lo), y: r * Math.cos(la) * Math.sin(lo), z: r * Math.sin(la) };
}

/** Observer position in ECI on the WGS84 ellipsoid (same model as sky.js lookAngles), km. */
export function observerEci(latDeg, lonDeg, heightKm, date) {
  const ecf = geodeticToEcf({ latitude: degreesToRadians(latDeg), longitude: degreesToRadians(lonDeg), height: heightKm });
  return rotZ(ecf, gmstRad(date));
}

/** Rotate a vector about +z by `ang` radians (ECEF -> ECI when ang = GMST). */
export function rotZ(v, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export function geoToEci(latDeg, lonDeg, altKm, date) {
  return rotZ(geoToEcef(latDeg, lonDeg, altKm), gmstRad(date));
}

/** East/north/up unit vectors at a site, expressed in ECI at `date`. */
export function enuBasisEci(latDeg, lonDeg, date) {
  const la = latDeg * D2R, lo = lonDeg * D2R, g = gmstRad(date);
  const e = { x: -Math.sin(lo), y: Math.cos(lo), z: 0 };
  const n = { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) };
  const u = { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
  return { east: rotZ(e, g), north: rotZ(n, g), up: rotZ(u, g) };
}

/** Unit vector for (azimuth from north, elevation) in the east/north/up basis. */
export function lookDirEci(basis, azDeg, elDeg) {
  const az = azDeg * D2R, el = elDeg * D2R;
  const h = Math.cos(el), a = Math.sin(az) * h, b = Math.cos(az) * h, c = Math.sin(el);
  const { east: E, north: N, up: U } = basis;
  return { x: a * E.x + b * N.x + c * U.x, y: a * E.y + b * N.y + c * U.y, z: a * E.z + b * N.z + c * U.z };
}

/** Horizon elevation (deg) at an azimuth from a 360-entry profile, linear interpolation. */
export function horizonAt(profile, azDeg) {
  if (!profile || profile.length === 0) return 0;
  const n = profile.length;
  const f = (((azDeg % 360) + 360) % 360) * (n / 360);
  const i = Math.floor(f) % n;
  const t = f - Math.floor(f);
  return profile[i] * (1 - t) + profile[(i + 1) % n] * t;
}

/**
 * Count satellites above the local horizon profile. positions is the ECI km
 * Float32Array, flags marks invalid (2). Topocentric dot products, no trig per
 * axis beyond atan2/asin.
 */
export function countAboveHorizon(positions, flags, constellationIdx, date, profile, obs = UWB, onVisible = null) {
  const basis = enuBasisEci(obs.latDeg, obs.lonDeg, date);
  const o = observerEci(obs.latDeg, obs.lonDeg, obs.heightKm, date);
  const counts = [0, 0];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === 2) continue;
    const dx = positions[3 * i] - o.x, dy = positions[3 * i + 1] - o.y, dz = positions[3 * i + 2] - o.z;
    const up = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
    if (up <= 0) continue;
    const range = Math.hypot(dx, dy, dz);
    const el = Math.asin(up / range) / D2R;
    if (el < 0) continue;
    const e = dx * basis.east.x + dy * basis.east.y + dz * basis.east.z;
    const nn = dx * basis.north.x + dy * basis.north.y + dz * basis.north.z;
    const az = ((Math.atan2(e, nn) / D2R) % 360 + 360) % 360;
    if (el >= horizonAt(profile, az)) { counts[constellationIdx[i]]++; if (onVisible) onVisible(i); }
  }
  return counts;
}
