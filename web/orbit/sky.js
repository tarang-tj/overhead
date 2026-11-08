// Pure sky geometry shared by the browser (Look Up, Tonight) and the Node data
// pipeline (tools/build-passes.mjs). No DOM, no network. Angles in degrees at
// the API boundary; satellite.js works in radians and km internally.
import {
  degreesToRadians, ecfToLookAngles, eciToEcf, gstime, propagate,
} from "satellite.js";

export const EARTH_RADIUS_KM = 6378.137;
const RAD = 180 / Math.PI;

/** UW Bothell main campus (OSM Nominatim, checked 2026-11-07) at ground level (Open-Meteo/Copernicus: 26 m). */
export const UWB = Object.freeze({ name: "UW Bothell", latDeg: 47.7603126, lonDeg: -122.1915305, heightKm: 0.026 });

/** Observer in satellite.js geodetic form (radians, km). */
export function observerGd(obs = UWB) {
  return {
    latitude: degreesToRadians(obs.latDeg),
    longitude: degreesToRadians(obs.lonDeg),
    height: obs.heightKm,
  };
}

/**
 * Low-precision Sun direction in ECI (true equator of date), unit vector.
 * Astronomical Almanac formula, good to ~0.01 deg 1950-2050; plenty for
 * "is this satellite sunlit" and "is it dark at UWB".
 */
export function sunEciUnit(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = degreesToRadians((357.528 + 0.9856003 * n) % 360);
  const lambda = degreesToRadians(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = degreesToRadians(23.439 - 0.0000004 * n);
  const x = Math.cos(lambda);
  const y = Math.cos(eps) * Math.sin(lambda);
  const z = Math.sin(eps) * Math.sin(lambda);
  return { x, y, z };
}

/** Sun declination in degrees (handy for tests and the UI). */
export function sunDeclinationDeg(date) {
  return Math.asin(sunEciUnit(date).z) * RAD;
}

/**
 * Cylindrical Earth-shadow test: a satellite at ECI position `r` (km) is in
 * shadow when it is on the night side and inside Earth's shadow cylinder.
 */
export function isSunlit(r, sunUnit) {
  const along = r.x * sunUnit.x + r.y * sunUnit.y + r.z * sunUnit.z;
  if (along >= 0) return true;
  const px = r.x - along * sunUnit.x;
  const py = r.y - along * sunUnit.y;
  const pz = r.z - along * sunUnit.z;
  return Math.hypot(px, py, pz) > EARTH_RADIUS_KM;
}

/** Az/El (deg) and range (km) of an ECI position from an observer at `date`. */
export function lookAngles(positionEci, date, obs = UWB) {
  const gmst = gstime(date);
  const ecf = eciToEcf(positionEci, gmst);
  const la = ecfToLookAngles(observerGd(obs), ecf);
  return {
    azDeg: ((la.azimuth * RAD) % 360 + 360) % 360,
    elDeg: la.elevation * RAD,
    rangeKm: la.rangeSat,
  };
}

/** Sun elevation (deg) seen by the observer: below -6 is civil dusk/dark. */
export function sunElevationDeg(date, obs = UWB) {
  const s = sunEciUnit(date);
  const AU = 149597870.7;
  return lookAngles({ x: s.x * AU, y: s.y * AU, z: s.z * AU }, date, obs).elDeg;
}

/** Propagate a satrec; returns ECI km or null when SGP4 fails (decayed, bad elements). */
export function eciAt(satrec, date) {
  try {
    const pv = propagate(satrec, date);
    const p = pv && pv.position;
    if (!p || !Number.isFinite(p.x)) return null;
    return p;
  } catch {
    return null;
  }
}

/** Mean altitude (km) from an OMM's mean motion (rev/day) via Kepler's third law. */
export function meanAltitudeKm(meanMotionRevPerDay) {
  const MU = 398600.4418;
  const n = (meanMotionRevPerDay * 2 * Math.PI) / 86400;
  const a = Math.cbrt(MU / (n * n));
  return a - EARTH_RADIUS_KM;
}

/**
 * Naked-eye "could be seen" test for a pass sample. Presence is not
 * visibility: the satellite must be above the horizon (min elevation), sunlit,
 * and the observer's sky dark enough (sun below -6 deg). Brightness is NOT
 * modeled here; the UI says so.
 */
export function canBeSeen({ elDeg, sunlit, sunElDeg }, minElDeg = 10) {
  return elDeg >= minElDeg && sunlit && sunElDeg <= -6;
}
