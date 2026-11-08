import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { projectToPixels, nearestProjected, behindSphere, PICK_RADIUS_PX } from "../web/render/pick-math.js";

function cam() {
  const c = new THREE.PerspectiveCamera(45, 800 / 600, 1, 1e5);
  c.up.set(0, 0, 1);
  c.position.set(20000, 0, 0);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  const m = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  return { c, m: m.elements };
}

test("projectToPixels agrees with three.js Vector3.project", () => {
  const { c, m } = cam();
  for (const p of [[0, 0, 0], [0, 3000, 1000], [-5000, -2000, 4000], [2000, 1500, -900]]) {
    const ref = new THREE.Vector3(...p).project(c);
    const s = projectToPixels(m, ...p, 800, 600);
    assert.ok(Math.abs(s.x - (ref.x * 0.5 + 0.5) * 800) < 1e-3, `x ${s.x}`);
    assert.ok(Math.abs(s.y - (1 - (ref.y * 0.5 + 0.5)) * 600) < 1e-3, `y ${s.y}`);
  }
  const mid = projectToPixels(m, 0, 0, 0, 800, 600);
  assert.ok(Math.abs(mid.x - 400) < 1e-3 && Math.abs(mid.y - 300) < 1e-3, "origin is the screen center");
});

test("points behind the camera do not project", () => {
  const { m } = cam();
  assert.equal(projectToPixels(m, 40000, 0, 0, 800, 600), null);
});

test("nearestProjected picks the closest dot inside 14 px and nothing outside", () => {
  const { m } = cam();
  // three sats near the origin as seen from +x: y shifts screen x, z shifts screen y.
  const positions = new Float32Array([0, 0, 0, 0, 100, 0, 0, 5000, 0]);
  const flags = new Uint8Array([0, 0, 0]);
  const a = projectToPixels(m, 0, 100, 0, 800, 600);
  assert.equal(nearestProjected(positions, flags, m, 800, 600, a.x + 2, a.y + 1), 1);
  assert.equal(nearestProjected(positions, flags, m, 800, 600, 400, 300), 0);
  const far = projectToPixels(m, 0, 5000, 0, 800, 600);
  assert.equal(nearestProjected(positions, flags, m, 800, 600, far.x + PICK_RADIUS_PX + 3, far.y), -1);
  assert.equal(nearestProjected(positions, flags, m, 800, 600, far.x + PICK_RADIUS_PX - 2, far.y), 2);
});

test("invalid sats and vetoed candidates are skipped", () => {
  const { m } = cam();
  const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
  assert.equal(nearestProjected(positions, new Uint8Array([2, 0]), m, 800, 600, 400, 300), 1);
  assert.equal(nearestProjected(positions, new Uint8Array([0, 0]), m, 800, 600, 400, 300, 14, (i) => i === 0), 1);
  assert.equal(nearestProjected(positions, new Uint8Array([0, 0]), m, 800, 600, 400, 300, 14, () => true), -1);
});

test("behindSphere: far side of Earth is hidden, near side and orbit-edge are not", () => {
  const camPos = { x: 20000, y: 0, z: 0 };
  assert.equal(behindSphere(camPos, { x: -7000, y: 0, z: 0 }, 6378), true);
  assert.equal(behindSphere(camPos, { x: 7000, y: 0, z: 0 }, 6378), false);
  assert.equal(behindSphere(camPos, { x: 0, y: 7500, z: 0 }, 6378), false);
});
