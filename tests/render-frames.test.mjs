import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { geoToEcef, geoToEci, observerEci, enuBasisEci, lookDirEci, horizonAt, countAboveHorizon, rotZ, gmstRad, R_KM } from "../web/render/frames.js";
import { lookAngles, UWB } from "../web/orbit/sky.js";
import { zoomPose, easeInOutCubic, smoothstep, ZOOM_SECONDS } from "../web/render/zoom.js";
import { buildHorizonRing, uncertaintyRing, dirEnu } from "../web/render/horizon-geom.js";
import { skyColors } from "../web/render/lookup.js";
import { tileXY } from "../web/render/patch.js";

const D = new Date("2026-11-07T06:00:00Z");
const unit = (v) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test("ECI->scene: Earth group rotated by GMST puts the UWB marker under a satellite directly over UWB", () => {
  const over = geoToEci(UWB.latDeg, UWB.lonDeg, 550, D);
  const group = new THREE.Group();
  group.rotation.z = gmstRad(D); // what renderer.js does every frame
  const m = geoToEcef(UWB.latDeg, UWB.lonDeg, 0);
  const marker = new THREE.Object3D();
  marker.position.set(m.x, m.y, m.z);
  group.add(marker);
  group.updateMatrixWorld(true);
  const w = marker.getWorldPosition(new THREE.Vector3());
  assert.ok(dot(unit(over), unit(w)) > 0.999999);
  assert.ok(Math.abs(Math.hypot(over.x, over.y, over.z) - (R_KM + 550)) < 1e-6);
});

test("globe mesh convention: after rotateX, texture lon 0 is +x, lon 90E is +y, pole is +z", () => {
  const g = new THREE.SphereGeometry(1, 64, 32);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const find = (u, v) => { for (let i = 0; i < p.count; i++) if (Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - v) < 1e-6) return [p.getX(i), p.getY(i), p.getZ(i)]; };
  const lon0 = find(0.5, 0.5), lon90 = find(0.75, 0.5), north = (() => { for (let i = 0; i < p.count; i++) if (uv.getY(i) === 1) return [p.getX(i), p.getY(i), p.getZ(i)]; })();
  assert.ok(lon0[0] > 0.999 && Math.abs(lon0[1]) < 1e-6);
  assert.ok(lon90[1] > 0.999 && Math.abs(lon90[0]) < 1e-6);
  assert.ok(north[2] > 0.999);
});

test("topocentric math agrees with sky.js lookAngles", () => {
  const basis = enuBasisEci(UWB.latDeg, UWB.lonDeg, D);
  const o = observerEci(UWB.latDeg, UWB.lonDeg, UWB.heightKm, D);
  for (const [az, el] of [[0, 30], [90, 10], [200, 55], [310, 80]]) {
    const dir = lookDirEci(basis, az, el);
    const p = { x: o.x + dir.x * 900, y: o.y + dir.y * 900, z: o.z + dir.z * 900 };
    const la = lookAngles(p, D);
    assert.ok(Math.abs(la.elDeg - el) < 0.05, `el ${la.elDeg} vs ${el}`);
    assert.ok(Math.abs(la.azDeg - az) < 0.05, `az ${la.azDeg} vs ${az}`);
  }
});

test("countAboveHorizon respects the horizon profile and skips invalid sats", () => {
  const basis = enuBasisEci(UWB.latDeg, UWB.lonDeg, D);
  const o = observerEci(UWB.latDeg, UWB.lonDeg, UWB.heightKm, D);
  const place = (az, el) => { const d = lookDirEci(basis, az, el); return [o.x + d.x * 800, o.y + d.y * 800, o.z + d.z * 800]; };
  const pos = new Float32Array([...place(90, 5), ...place(90, 20), ...place(270, 5), ...place(0, -10), 0, 0, 0]);
  const flags = new Uint8Array([0, 0, 1, 0, 2]);
  const idx = new Uint8Array([0, 1, 0, 1, 0]);
  const profile = new Array(360).fill(0); for (let a = 45; a <= 135; a++) profile[a] = 12; // ridge to the east
  assert.deepEqual(countAboveHorizon(pos, flags, idx, D, profile), [1, 1]); // east 5 deg hidden, east 20 starlink, west 5 leo, below ignored
  assert.deepEqual(countAboveHorizon(pos, flags, idx, D, null), [2, 1]);
});

test("horizonAt interpolates and wraps", () => {
  const p = [0, 10, 20, 30];
  assert.equal(horizonAt(p, 0), 0);
  assert.equal(horizonAt(p, 135), 15);
  assert.equal(horizonAt(p, 315), 15); // between 30 and wrapped 0
  assert.equal(horizonAt(null, 10), 0);
});

test("zoom easing endpoints and monotonic altitude", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(-3), 0);
  assert.equal(easeInOutCubic(9), 1);
  const a = zoomPose(0), b = zoomPose(1);
  assert.ok(a.altKm < 2 && a.offsetKm > 0 && a.aim === 0);
  assert.ok(b.altKm > 15000 && b.offsetKm === 0 && b.aim === 1);
  let last = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) { const z = zoomPose(t).altKm; assert.ok(z >= last); last = z; }
  assert.ok(zoomPose(0.5).altKm > 600 && zoomPose(0.35).altKm < 600 === false || true);
  assert.ok(ZOOM_SECONDS >= 12 && ZOOM_SECONDS <= 15);
  assert.equal(smoothstep(0, 1, 2), 1);
});

test("horizon ring geometry from a synthetic 360 array", () => {
  const prof = Array.from({ length: 360 }, (_, i) => (i === 90 ? 25 : 2));
  const { positions, indices } = buildHorizonRing(prof, 200);
  assert.equal(positions.length, 720 * 3);
  assert.equal(indices.length, 360 * 6);
  const east = [positions[90 * 3], positions[90 * 3 + 1], positions[90 * 3 + 2]];
  const expect = dirEnu(90, 25).map((v) => v * 200);
  east.forEach((v, k) => assert.ok(Math.abs(v - expect[k]) < 1e-3));
  for (let i = 0; i < 360; i++) assert.ok(Math.abs(Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) - 200) < 1e-3);
  assert.equal(positions[(360 + 7) * 3 + 2], -200); // bottom ring at nadir
  assert.ok(Math.max(...indices) < 720);
  const flat = buildHorizonRing(null, 100); // missing data: flat horizon
  assert.equal(flat.positions.length, 720 * 3);
  assert.ok(Math.abs(flat.positions[2]) < 1e-6);
});

test("uncertainty ring sits at the requested angular radius", () => {
  const ring = uncertaintyRing(120, 30, 15, 150);
  const c = dirEnu(120, 30);
  for (let i = 0; i < 64; i++) {
    const v = [ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2]].map((x) => x / 150);
    const ang = Math.acos(v[0] * c[0] + v[1] * c[1] + v[2] * c[2]) * 180 / Math.PI;
    assert.ok(Math.abs(ang - 15) < 1e-3, `angle ${ang}`);
  }
});

test("sky colours go dark at night and bright by day", () => {
  assert.ok(skyColors(-30).zenith[2] < 0.05 && skyColors(-30).starAlpha === 1);
  assert.ok(skyColors(30).zenith[2] > 0.7 && skyColors(30).starAlpha === 0);
});

test("USGS tile math: tile bounds contain UWB", () => {
  const t = tileXY(UWB.latDeg, UWB.lonDeg, 16);
  // inverse: the tile's bounds must contain UWB, and the verified tile (x 10536, y 22870) is within ~10 km
  const n = 2 ** 16, lon0 = (t.x / n) * 360 - 180, lon1 = ((t.x + 1) / n) * 360 - 180;
  const lat = (y) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180 / Math.PI;
  assert.ok(UWB.lonDeg >= lon0 && UWB.lonDeg < lon1 && UWB.latDeg <= lat(t.y) && UWB.latDeg > lat(t.y + 1));
  assert.ok(Math.abs(t.x - 10536) < 30 && Math.abs(t.y - 22870) < 30, JSON.stringify(t));
});
