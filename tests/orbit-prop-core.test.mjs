import { test } from "node:test";
import assert from "node:assert/strict";
import * as sat from "satellite.js";
import { buildSatrecs, sweep, FLAG_INVALID, FLAG_SHADOW, FLAG_SUNLIT } from "../web/orbit/propagator-core.js";
import { sunEciUnit, isSunlit } from "../web/orbit/sky.js";

// ISS-like OMM (CelesTrak GP JSON shape), epoch 2026-11-07.
export const OMM = {
  OBJECT_NAME: "TESTSAT", OBJECT_ID: "2026-001A", NORAD_CAT_ID: 99001, EPOCH: "2026-11-07T00:00:00.000000",
  MEAN_MOTION: 15.2, ECCENTRICITY: 0.0004, INCLINATION: 53.05, RA_OF_ASC_NODE: 120.5, ARG_OF_PERICENTER: 90.1,
  MEAN_ANOMALY: 270.2, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: "U", ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100,
  BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00002, MEAN_MOTION_DDOT: 0,
};

test("sweep matches satellite.js propagate() for the same instant", () => {
  const date = new Date("2026-11-07T06:30:00Z");
  const recs = buildSatrecs(sat, [OMM]);
  const pos = new Float32Array(3), flags = new Uint8Array(1);
  assert.equal(sweep(sat, recs, date, sunEciUnit(date), pos, flags), 1);
  const ref = sat.propagate(sat.json2satrec(OMM), date).position;
  for (const [i, k] of [[0, "x"], [1, "y"], [2, "z"]]) assert.ok(Math.abs(pos[i] - ref[k]) < 0.01, `${k}: ${pos[i]} vs ${ref[k]}`);
  const r = Math.hypot(...pos);
  assert.ok(r > 6700 && r < 6900, `radius ${r}`);
});

test("shadow flag agrees with sky.js isSunlit", () => {
  const date = new Date("2026-11-07T06:30:00Z");
  const sun = sunEciUnit(date);
  const recs = buildSatrecs(sat, Array.from({ length: 40 }, (_, i) => ({ ...OMM, MEAN_ANOMALY: i * 9 })));
  const pos = new Float32Array(120), flags = new Uint8Array(40);
  sweep(sat, recs, date, sun, pos, flags);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const lit = isSunlit({ x: pos[3 * i], y: pos[3 * i + 1], z: pos[3 * i + 2] }, sun);
    assert.equal(flags[i], lit ? FLAG_SUNLIT : FLAG_SHADOW);
    seen.add(flags[i]);
  }
  assert.equal(seen.size, 2, "fixture should include both lit and shadowed sats");
});

test("bad OMMs never throw and are flagged invalid", () => {
  const date = new Date("2026-11-07T06:30:00Z");
  const recs = buildSatrecs(sat, [null, {}, { ...OMM, MEAN_MOTION: "junk" }, { ...OMM, ECCENTRICITY: 1.5 }, OMM]);
  const pos = new Float32Array(15), flags = new Uint8Array(5);
  let valid;
  assert.doesNotThrow(() => { valid = sweep(sat, recs, date, sunEciUnit(date), pos, flags); });
  assert.equal(flags[0], FLAG_INVALID);
  assert.equal(flags[1], FLAG_INVALID);
  assert.notEqual(flags[4], FLAG_INVALID);
  assert.equal(valid, flags.filter((f) => f !== FLAG_INVALID).length);
  assert.deepEqual([...pos.slice(0, 3)], [0, 0, 0]);
});

test("sweep of 11.6k sats: timing sanity (prints ms)", () => {
  const n = 11600;
  const omms = Array.from({ length: n }, (_, i) => ({ ...OMM, MEAN_ANOMALY: (i * 7.3) % 360, RA_OF_ASC_NODE: (i * 3.1) % 360, MEAN_MOTION: 15.0 + (i % 5) * 0.03 }));
  const recs = buildSatrecs(sat, omms);
  const date = new Date("2026-11-07T06:30:00Z");
  const pos = new Float32Array(n * 3), flags = new Uint8Array(n), sun = sunEciUnit(date);
  sweep(sat, recs, date, sun, pos, flags); // warm up
  const t = [];
  for (let k = 0; k < 7; k++) { const t0 = performance.now(); sweep(sat, recs, new Date(date.getTime() + k * 1000), sun, pos, flags); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  console.log(`# ms/sweep for ${n} sats: median ${t[3].toFixed(2)} min ${t[0].toFixed(2)} max ${t[6].toFixed(2)}`);
  assert.ok(t[3] < 250, `median ${t[3]} ms`);
});
