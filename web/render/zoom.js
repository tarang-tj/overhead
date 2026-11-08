// Pure zoom-shot choreography: time -> camera pose parameters. No three.js.
export const ZOOM_SECONDS = 13;
const START_ALT_KM = 0.9;
const END_DIST_KM = 26000; // camera distance from Earth centre at the end

export function easeInOutCubic(t) {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Pose at normalized time t in [0,1] for a camera over a site. `altKm` rises
 * log-uniformly from START_ALT_KM to the end distance minus the radius.
 * `offsetKm` is how far south the camera sits (oblique look at the start),
 * `aim` blends the look target from the ground point (0) to Earth centre (1),
 * `radiusKm` is the Earth radius used.
 */
export function zoomPose(t, radiusKm = 6378.137) {
  const p = easeInOutCubic(t);
  const endAlt = END_DIST_KM - radiusKm;
  const altKm = START_ALT_KM * Math.pow(endAlt / START_ALT_KM, p);
  return {
    p,
    altKm,
    offsetKm: altKm * 0.9 * (1 - smoothstep(0.1, 0.85, p)),
    aim: smoothstep(0.35, 0.95, p),
  };
}
