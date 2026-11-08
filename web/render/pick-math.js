// Pure screen-space picking. `viewProj` is a column-major 4x4 (projectionMatrix * matrixWorldInverse,
// the layout three.js uses). No three.js import so Node tests can run it on a synthetic camera.
export const PICK_RADIUS_PX = 14;

/** World point -> { x, y } in CSS pixels (y down), or null when behind the camera / outside depth. */
export function projectToPixels(m, x, y, z, w, h) {
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!(cw > 0)) return null;
  const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw;
  const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
  const nz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / cw;
  if (nz < -1 || nz > 1) return null;
  return { x: (nx * 0.5 + 0.5) * w, y: (1 - (ny * 0.5 + 0.5)) * h };
}

/** True when the segment from `cam` to `p` passes through a sphere of radius `r` at the origin (p is hidden behind it). */
export function behindSphere(cam, p, r) {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 === 0) return false;
  const t = Math.min(1, Math.max(0, -(cam.x * dx + cam.y * dy + cam.z * dz) / len2));
  const cx = cam.x + dx * t, cy = cam.y + dy * t, cz = cam.z + dz * t;
  return cx * cx + cy * cy + cz * cz < r * r;
}

/**
 * Index of the satellite nearest (px, py) within `radius` px, or -1.
 * `skip(i, x, y, z)` may veto a candidate (hidden category, occluded by Earth, below horizon).
 */
export function nearestProjected(positions, flags, m, w, h, px, py, radius = PICK_RADIUS_PX, skip = null) {
  let best = -1, bestD = radius * radius;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === 2) continue;
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    const s = projectToPixels(m, x, y, z, w, h);
    if (!s) continue;
    const d = (s.x - px) ** 2 + (s.y - py) ** 2;
    if (d >= bestD) continue;
    if (skip && skip(i, x, y, z)) continue;
    best = i; bestD = d;
  }
  return best;
}
