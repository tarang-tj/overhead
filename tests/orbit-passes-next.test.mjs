import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findPasses, makeTimes, nextPass, satrecOrNull, sunTimeline } from "../web/orbit/passes.js";
import { UWB, eciAt, lookAngles } from "../web/orbit/sky.js";
import * as toolPasses from "../tools/lib/passes.mjs";

const gp = JSON.parse(readFileSync(new URL("./fixtures/leo-gp.json", import.meta.url), "utf8"));
const from = new Date(gp[0].EPOCH + "Z");
const times = makeTimes(from, 48, 20);
const sun = sunTimeline(times);

test("tools/lib/passes.mjs re-exports the browser-safe module", () => {
  assert.equal(toolPasses.findPasses, findPasses);
  assert.equal(toolPasses.nextPass, nextPass);
});

test("nextPass equals the first findPasses pass, field for field", () => {
  let compared = 0;
  for (const omm of gp.slice(0, 40)) {
    const rec = satrecOrNull(omm);
    const first = findPasses(rec, times, sun)[0] ?? null;
    assert.deepEqual(nextPass(rec, UWB, from), first, omm.OBJECT_NAME);
    if (first) compared += 1;
  }
  assert.ok(compared > 5, `expected several satellites with a pass in 48 h, got ${compared}`);
});

test("nextPass returns null for a GEO satellite on the far side of Earth", () => {
  const geo = (ma) => ({
    OBJECT_NAME: "GEO-TEST", NORAD_CAT_ID: 99999, EPOCH: gp[0].EPOCH, MEAN_MOTION: 1.0027, ECCENTRICITY: 0.0001,
    INCLINATION: 0.05, RA_OF_ASC_NODE: 0, ARG_OF_PERICENTER: 0, MEAN_ANOMALY: ma, BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0,
  });
  const rec = [0, 60, 120, 180, 240, 300].map((m) => satrecOrNull(geo(m)))
    .find((r) => lookAngles(eciAt(r, from), from, UWB).elDeg < -30);
  assert.ok(rec, "need a GEO below the horizon at t0");
  assert.equal(nextPass(rec, UWB, from), null);
});

test("nextPass 48 h at 20 s runs in under 100 ms", () => {
  const rec = satrecOrNull(gp[0]);
  nextPass(rec, UWB, from); // warm up
  const runs = 5;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) nextPass(rec, UWB, from);
  const ms = (performance.now() - t0) / runs;
  console.log(`nextPass 48h/20s: ${ms.toFixed(1)} ms avg`);
  assert.ok(ms < 100, `took ${ms} ms`);
});
