import assert from "node:assert/strict";
import test from "node:test";
import {
  destination, distanceBearing, elevationAngleDeg, interpolateRing, rayDistancesKm, rayHorizonDeg,
} from "../tools/lib/horizon.mjs";

test("flat terrain at observer height dips below zero by Earth curvature", () => {
  // drop = d^2 / 2R = 100^2 / 12742 km = 0.7848 km, atan(0.7848/100) = 0.4497 deg
  assert.ok(Math.abs(elevationAngleDeg(100, 26, 26) + 0.4497) < 0.005);
});

test("a 4380 m summit at 100 km is about 2.0 deg after curvature", () => {
  const el = elevationAngleDeg(100, 4380, 26);
  assert.ok(el > 1.9 && el < 2.1, String(el));
});

test("ray horizon takes the maximum angle, not the farthest sample", () => {
  const samples = [
    { distKm: 5, heightM: 300 },
    { distKm: 50, heightM: 100 },
    { distKm: 100, heightM: 0 },
  ];
  const el = rayHorizonDeg(samples, 26);
  assert.equal(el, elevationAngleDeg(5, 300, 26));
});

test("destination and distanceBearing round trip", () => {
  const p = destination(47.76, -122.19, 135, 80);
  const back = distanceBearing({ latDeg: 47.76, lonDeg: -122.19 }, p);
  assert.ok(Math.abs(back.distanceKm - 80) < 0.01);
  assert.ok(Math.abs(back.azDeg - 135) < 0.1);
});

test("Rainier bearing from UWB is south-southeast at roughly 105 km", () => {
  const r = distanceBearing({ latDeg: 47.7603126, lonDeg: -122.1915305 }, { latDeg: 46.8523, lonDeg: -121.7603 });
  assert.ok(r.azDeg > 150 && r.azDeg < 170 && r.distanceKm > 95 && r.distanceKm < 115, JSON.stringify(r));
});

test("ring interpolation expands to 360 values and wraps at north", () => {
  const ring = Array.from({ length: 180 }, (_, i) => (i === 179 ? 10 : 0));
  const out = interpolateRing(ring, 2);
  assert.equal(out.length, 360);
  assert.equal(out[358], 10);
  assert.equal(out[359], 5);
  assert.equal(out[0], 0);
});

test("ray distances are ascending and stay within 150 km", () => {
  const d = rayDistancesKm();
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
  assert.ok(d.at(-1) <= 150);
});
