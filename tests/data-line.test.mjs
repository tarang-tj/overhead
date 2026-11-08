import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildConstellation } from "../tools/lib/line.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const gp = load("leo-gp.json");
const satcat = load("leo-satcat.json");
const now = new Date("2026-11-07T22:00:00Z");
const run = () => buildConstellation({ key: "leo", label: "Amazon Leo", catalogName: "KUIPER", gp, satcat, now });

test("stage counts add up to the in-orbit count", () => {
  const c = run();
  const { raising, onStation, descending, unknown } = c.stages;
  assert.equal(raising + onStation + descending + unknown, gp.length);
  assert.equal(c.inOrbit, gp.length);
  assert.ok(onStation > 0 && raising + descending > 0, "fixture should hold both stages");
});

test("debris is excluded from launched and decayed", () => {
  const c = run();
  const payloads = satcat.filter((r) => r.OBJECT_TYPE === "PAY");
  assert.ok(satcat.some((r) => r.OBJECT_TYPE === "DEB"));
  assert.equal(c.stages.launched, payloads.length);
  assert.equal(c.stages.decayed, payloads.filter((r) => r.DECAY_DATE).length);
});

test("shell found near 620 km and months are sorted and sum to launches", () => {
  const c = run();
  assert.ok(c.shells.some((s) => s.minKm <= 620 && s.maxKm >= 620));
  const months = c.launchesByMonth.map((m) => m.month);
  assert.deepEqual(months, [...months].sort());
  assert.equal(c.launchesByMonth.reduce((a, m) => a + m.count, 0), c.stages.launched);
});

test("Little's Law raise time follows raising / rate, null when idle", () => {
  const c = run();
  if (c.arrivalRatePerDay90 > 0) assert.equal(c.impliedRaiseDays, c.stages.raising / c.arrivalRatePerDay90);
  else assert.equal(c.impliedRaiseDays, null);
  const idle = buildConstellation({ key: "leo", label: "x", catalogName: "KUIPER", gp, satcat, now: new Date("2030-01-01T00:00:00Z") });
  assert.equal(idle.arrivalRatePerDay90, 0);
  assert.equal(idle.impliedRaiseDays, null);
});

test("sites count payloads and the factory is attached", () => {
  const c = run();
  assert.equal(Object.values(c.sites).reduce((a, b) => a + b, 0), c.stages.launched);
  assert.equal(c.factory.city, "Kirkland, WA");
  assert.match(c.lastLaunchDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("GP row without mean motion falls back to SATCAT apogee/perigee", () => {
  const row = { ...gp[0], MEAN_MOTION: undefined };
  const c = buildConstellation({ key: "leo", label: "x", catalogName: "KUIPER", gp: [row], satcat, now });
  assert.equal(c.inOrbit, 1);
});

test("stageIds lists exactly the raising and descending satellites, nothing else", () => {
  const c = run();
  assert.equal(c.stageIds.raising.length, c.stages.raising);
  assert.equal(c.stageIds.descending.length, c.stages.descending);
  const known = new Set(gp.map((g) => g.NORAD_CAT_ID));
  for (const id of [...c.stageIds.raising, ...c.stageIds.descending]) assert.ok(known.has(id));
  assert.equal(new Set([...c.stageIds.raising, ...c.stageIds.descending]).size, c.stages.raising + c.stages.descending);
});
