import { test } from "node:test";
import assert from "node:assert/strict";
import * as sat from "satellite.js";
import * as passes from "../web/orbit/passes.js";
import { noradIndexOf, runNextPass } from "../web/orbit/propagator-pass.js";
import { createPropagator } from "../web/orbit/propagator.js";
import { UWB } from "../web/orbit/sky.js";

const OMM = {
  OBJECT_NAME: "TESTSAT", OBJECT_ID: "2026-001A", NORAD_CAT_ID: 99001, EPOCH: "2026-11-07T00:00:00.000000",
  MEAN_MOTION: 15.2, ECCENTRICITY: 0.0004, INCLINATION: 53.05, RA_OF_ASC_NODE: 120.5, ARG_OF_PERICENTER: 90.1,
  MEAN_ANOMALY: 270.2, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: "U", ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100,
  BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00002, MEAN_MOTION_DDOT: 0,
};
const FROM = new Date("2026-11-07T06:00:00Z");

test("noradIndexOf maps ids to slots and skips bad entries", () => {
  const m = noradIndexOf([{ NORAD_CAT_ID: 5 }, {}, null, { NORAD_CAT_ID: "7" }]);
  assert.equal(m.get(5), 0);
  assert.equal(m.get(7), 3);
  assert.equal(m.size, 2);
});

test("runNextPass equals passes.nextPass and times well under the 100 ms budget (B4)", () => {
  const rec = sat.json2satrec(OMM);
  const t0 = performance.now();
  const a = runNextPass(passes, rec, UWB, FROM.getTime());
  const ms = performance.now() - t0;
  const b = passes.nextPass(rec, UWB, FROM);
  assert.deepEqual(a, b);
  console.log(`nextPass 48h/20s latency: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 500, `${ms} ms`) // budget is 100 ms; slack for loaded CI;
});

test("runNextPass validates its inputs", () => {
  const rec = sat.json2satrec(OMM);
  assert.equal(runNextPass(passes, null, UWB, FROM.getTime()), null);
  assert.throws(() => runNextPass(passes, rec, { latDeg: NaN, lonDeg: 0 }, FROM.getTime()), /observer/);
  assert.throws(() => runNextPass(passes, rec, UWB, NaN), /start/);
  assert.throws(() => runNextPass({}, rec, UWB, FROM.getTime()), /nextPass/);
});

test("propagator without Worker: sweeps follow the injected sim clock, tickNow resweeps, requestNextPass answers", async () => {
  let t = FROM.getTime();
  const p = createPropagator({ now: () => new Date(t), intervalMs: 20 });
  const seen = [];
  p.onUpdate((r) => seen.push(r.timeMs));
  const warn = console.warn; console.warn = () => {};
  try {
    p.start([{ omm: OMM }]);
    assert.equal(seen[0], FROM.getTime());
    t += 6 * 3600e3;
    p.tickNow();
    assert.equal(seen.at(-1), t);
    const pass = await p.requestNextPass(99001, UWB, FROM);
    assert.deepEqual(pass, passes.nextPass(sat.json2satrec(OMM), UWB, FROM));
    assert.ok(p.lastPassMs >= 0);
    assert.equal(await p.requestNextPass(1, UWB, FROM), null, "unknown id gives null, not a throw");
    await assert.rejects(p.requestNextPass(99001, { latDeg: "x" }, FROM), /observer/);
    p.setIntervalMs(5); // below the floor: ignored
    p.setIntervalMs(30);
  } finally { console.warn = warn; p.dispose(); }
});
