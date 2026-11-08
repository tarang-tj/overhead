// Horizon silhouette geometry for Look Up. Local frame: x east, y north, z up.
const D2R = Math.PI / 180;

/** Direction (unit) for azimuth-from-north / elevation in the local ENU frame. */
export function dirEnu(azDeg, elDeg) {
  const az = azDeg * D2R, el = elDeg * D2R;
  return [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
}

/**
 * Terrain ring as a triangle strip-like indexed mesh: top edge follows the
 * horizon profile, bottom edge collapses to the nadir so nothing below the
 * horizon shows through. Returns { positions: Float32Array, indices: Uint32Array }.
 * `profile` has N entries (1 per azimuth step); the ring closes on itself.
 */
export function buildHorizonRing(profile, radius) {
  const n = profile && profile.length >= 3 ? profile.length : 360;
  const src = profile && profile.length >= 3 ? profile : new Array(360).fill(0);
  const positions = new Float32Array((n * 2) * 3);
  for (let i = 0; i < n; i++) {
    const az = (i * 360) / n;
    const top = dirEnu(az, Number.isFinite(src[i]) ? src[i] : 0);
    positions.set([top[0] * radius, top[1] * radius, top[2] * radius], i * 3);
    positions.set([0, 0, -radius], (n + i) * 3);
  }
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.set([i, n + i, j, j, n + i, n + j], i * 6);
  }
  return { positions, indices };
}

/** Points on a circle of angular radius `radiusDeg` around (azDeg, elDeg), on a sphere of `radius`. */
export function uncertaintyRing(azDeg, elDeg, radiusDeg, radius, segments = 64) {
  const c = dirEnu(azDeg, elDeg);
  // Orthonormal basis around c: pick an up-ish helper that is not parallel.
  const helper = Math.abs(c[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1];
  const a = cross(c, helper), al = Math.hypot(...a);
  const u = a.map((v) => v / al);
  const w = cross(c, u);
  const r = radiusDeg * D2R, cr = Math.cos(r), sr = Math.sin(r);
  const out = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * 2 * Math.PI;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = radius * (c[k] * cr + sr * (u[k] * Math.cos(th) + w[k] * Math.sin(th)));
  }
  return out;
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
