import { test } from "node:test";
import assert from "node:assert/strict";
import { sunDeclinationDeg, isSunlit, lookAngles, meanAltitudeKm, canBeSeen, sunElevationDeg, UWB, EARTH_RADIUS_KM } from "../web/orbit/sky.js";
import { geodeticToEcf, degreesToRadians, gstime } from "satellite.js";

test("sun declination: June solstice ~ +23.4, equinox ~ 0, December ~ -23.4", () => {
  assert.ok(Math.abs(sunDeclinationDeg(new Date("2026-06-21T12:00:00Z")) - 23.44) < 0.3);
  assert.ok(Math.abs(sunDeclinationDeg(new Date("2026-03-20T15:00:00Z"))) < 0.5);
  assert.ok(Math.abs(sunDeclinationDeg(new Date("2026-12-21T12:00:00Z")) + 23.44) < 0.3);
});

test("shadow: day side sunlit, behind Earth dark, far off-axis sunlit", () => {
  const sun = { x: 1, y: 0, z: 0 };
  assert.equal(isSunlit({ x: 7000, y: 0, z: 0 }, sun), true);
  assert.equal(isSunlit({ x: -7000, y: 0, z: 0 }, sun), false);
  assert.equal(isSunlit({ x: -7000, y: EARTH_RADIUS_KM + 100, z: 0 }, sun), true);
});

test("look angles: a point straight above UWB is at ~90 deg elevation", () => {
  const date = new Date("2026-11-07T06:00:00Z");
  const gd = { latitude: degreesToRadians(UWB.latDeg), longitude: degreesToRadians(UWB.lonDeg), height: 550 };
  const ecf = geodeticToEcf(gd);
  // Rotate ECF back to ECI with the same GMST lookAngles uses.
  const g = gstime(date);
  const eci = { x: ecf.x * Math.cos(g) - ecf.y * Math.sin(g), y: ecf.x * Math.sin(g) + ecf.y * Math.cos(g), z: ecf.z };
  const la = lookAngles(eci, date);
  assert.ok(la.elDeg > 89.5, `elevation ${la.elDeg}`);
  assert.ok(Math.abs(la.rangeKm - 550) < 1, `range ${la.rangeKm}`);
});

test("mean altitude: ISS-like 15.5 rev/day ~ 420 km, Leo shell 14.8 ~ 630 km", () => {
  assert.ok(Math.abs(meanAltitudeKm(15.5) - 420) < 15);
  const leo = meanAltitudeKm(14.8);
  assert.ok(leo > 600 && leo < 680, `got ${leo}`);
});

test("visibility gate needs elevation, sunlight and a dark sky", () => {
  assert.equal(canBeSeen({ elDeg: 40, sunlit: true, sunElDeg: -10 }), true);
  assert.equal(canBeSeen({ elDeg: 40, sunlit: false, sunElDeg: -10 }), false);
  assert.equal(canBeSeen({ elDeg: 40, sunlit: true, sunElDeg: 5 }), false);
  assert.equal(canBeSeen({ elDeg: 5, sunlit: true, sunElDeg: -10 }), false);
});

test("sun elevation at UWB: high at local noon in June, below horizon at local midnight", () => {
  assert.ok(sunElevationDeg(new Date("2026-06-21T20:10:00Z")) > 60);
  assert.ok(sunElevationDeg(new Date("2026-06-22T08:10:00Z")) < 0);
});
