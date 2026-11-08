import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { json2satrec, propagate } from "satellite.js";
import { buildSnapshotObject, minimalOmm } from "../tools/lib/snapshot.mjs";

const gp = JSON.parse(readFileSync(new URL("./fixtures/leo-gp.json", import.meta.url), "utf8"));

test("snapshot shape matches interfaces.md and round-trips through json2satrec", () => {
  const snap = buildSnapshotObject({ gpByKey: { leo: gp, starlink: gp.slice(0, 3) }, fetchedAt: "2026-11-07T00:00:00.000Z" });
  assert.equal(snap.sats.length, gp.length + 3);
  assert.deepEqual(new Set(snap.sats.map((s) => s.c)), new Set(["leo", "starlink"]));
  for (const { omm } of snap.sats) {
    const rec = json2satrec(omm);
    const p = propagate(rec, new Date(omm.EPOCH + "Z")).position;
    assert.ok(p && Number.isFinite(p.x) && Math.hypot(p.x, p.y, p.z) > 6500);
  }
});

test("minimal OMM propagates identically to the full record", () => {
  const t = new Date(gp[0].EPOCH + "Z");
  const a = propagate(json2satrec(gp[0]), t).position;
  const b = propagate(json2satrec(minimalOmm(gp[0])), t).position;
  assert.deepEqual(a, b);
});

test("a GP row missing a required field fails loudly", () => {
  const { BSTAR, ...rest } = gp[0];
  assert.throws(() => minimalOmm(rest), /missing BSTAR/);
});
