import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { json2satrec, propagate } from "satellite.js";
import { buildSnapshotObject, minimalOmm } from "../tools/lib/snapshot.mjs";

const gp = JSON.parse(readFileSync(new URL("./fixtures/leo-gp.json", import.meta.url), "utf8"));

test("snapshot shape matches interfaces.md and round-trips through json2satrec", () => {
  const categoryByNorad = new Map([[gp[0].NORAD_CAT_ID, "leo"], [gp[1].NORAD_CAT_ID, "stations"]]);
  const snap = buildSnapshotObject({ rows: gp, categoryByNorad, fetchedAt: "2026-11-07T00:00:00.000Z" });
  assert.equal(snap.sats.length, gp.length);
  assert.equal(snap.sats[0].c, "leo");
  assert.equal(snap.sats[1].c, "stations");
  assert.equal(snap.sats[2].c, "other", "unlisted satellites default to other");
  assert.match(snap.source, /GROUP=active/);
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

test("snapshot skips a row missing a field and counts it instead of throwing", () => {
  const { BSTAR, ...bad } = gp[0];
  const snap = buildSnapshotObject({ rows: [bad, gp[1]], fetchedAt: "x" });
  assert.equal(snap.sats.length, 1);
  assert.equal(snap.skipped, 1);
});
