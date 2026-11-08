// Pure orientation math for Look Up. No DOM.
import { direction16 } from "./format.js";

// ASSUMPTION: magnetic declination at UW Bothell is about +15 deg east
// (true north = magnetic north + 15). Phone compasses (iOS webkitCompassHeading,
// Android deviceorientationabsolute) report magnetic heading, so we add it.
// It drifts a fraction of a degree per year; not looked up live.
export const DECLINATION_DEG = 15;

const rad = Math.PI / 180;
const norm360 = (a) => ((a % 360) + 360) % 360;

/**
 * Direction the phone's back points (where the camera looks), from W3C device
 * orientation angles, as { az, el } in degrees. alpha is the compass-derived
 * rotation about vertical (0 = device top toward magnetic north when flat).
 */
export function pointingFromOrientation(alpha, beta, gamma, declination = DECLINATION_DEG) {
  const a = alpha * rad, b = beta * rad, g = gamma * rad;
  // Third column of R = Rz(alpha) Rx(beta) Ry(gamma): the screen normal in earth coords (x east, y north, z up).
  const x = Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g);
  const y = Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g);
  const z = Math.cos(b) * Math.cos(g);
  // The back of the phone points opposite the screen normal.
  const bx = -x, by = -y, bz = -z;
  const el = Math.asin(Math.max(-1, Math.min(1, bz))) / rad;
  const az = norm360(Math.atan2(bx, by) / rad + declination);
  return { az, el };
}

/** iOS: alpha is arbitrary, so rebuild it from webkitCompassHeading (clockwise from magnetic north). */
export const alphaFromCompassHeading = (heading) => norm360(360 - heading);

/** webkitCompassAccuracy is degrees, negative when invalid. Otherwise unknown (null). */
export function uncertaintyFrom(accuracy) {
  return Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
}

export function readoutText(az, el, unc) {
  const base = `Facing ${direction16(az)} ${Math.round(norm360(az))} deg, ${Math.round(el) === 0 ? "level with the horizon" : `${el > 0 ? "up" : "down"} ${Math.abs(Math.round(el))} deg`}`;
  return unc === null || unc === undefined ? base : `${base}. Compass accuracy about ${Math.round(unc)} deg`;
}

export const ACCURACY_NOTE =
  "Phone compasses are often off by 10 to 20 degrees. Magnetic declination of +15 deg is applied. Drag or use arrow keys if the sky looks shifted.";

/** Clamp look state. Elevation limited to straight down/up. */
export function clampLook(az, el) {
  return { az: norm360(az), el: Math.max(-90, Math.min(90, el)) };
}

/** Leading-edge throttle with a trailing call so the last value always lands. */
export function throttle(fn, hz = 30, clock = () => Date.now(), timer = setTimeout) {
  const gap = 1000 / hz;
  let last = -Infinity, pending = null, queued = false;
  return (...args) => {
    const t = clock();
    if (t - last >= gap) { last = t; fn(...args); return; }
    pending = args;
    if (queued) return;
    queued = true;
    timer(() => { queued = false; last = clock(); fn(...pending); }, gap - (t - last));
  };
}

/** A short, small pointer gesture is a tap (pick), anything else is a drag. */
export function isTap(down, up, maxPx = 6, maxMs = 350) {
  if (!down || !up) return false;
  return Math.hypot(up.x - down.x, up.y - down.y) < maxPx && up.t - down.t < maxMs;
}
