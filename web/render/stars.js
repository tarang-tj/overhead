// Fixed random starfield (not real star positions), drawn behind everything.
import * as THREE from "three";

export function createStars(pixelRatio) {
  const n = 3500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(th) * 9e4, s * Math.sin(th) * 9e4, z * 9e4], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.3 * pixelRatio, sizeAttenuation: false, transparent: true, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -5;
  return p;
}
