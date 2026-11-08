import { test } from "node:test";
import assert from "node:assert/strict";
import { findShells, classifyStage, arrivalRatePerDay, littleLawDays, countByMonth } from "../web/orbit/line-math.js";

test("findShells finds the dominant altitude mode and ignores stragglers", () => {
  const alts = [...Array(381).fill(630), 432, 440, 470, 510, 560, 590, 610, 612];
  const shells = findShells(alts);
  assert.equal(shells.length, 1);
  assert.ok(shells[0].minKm <= 630 && shells[0].maxKm > 630);
});

test("findShells merges adjacent bins and keeps two separated shells", () => {
  const alts = [...Array(100).fill(479), ...Array(100).fill(481), ...Array(100).fill(550)];
  const shells = findShells(alts);
  assert.equal(shells.length, 2);
  assert.equal(shells[0].count, 200);
});

test("classifyStage: shell=onStation, young low=raising, old low=descending", () => {
  const shells = [{ minKm: 630, maxKm: 640, centerKm: 635, count: 1 }];
  const now = new Date("2026-11-07T00:00:00Z");
  assert.equal(classifyStage(632, shells, "2025-01-01", now), "onStation");
  assert.equal(classifyStage(450, shells, "2026-10-01", now), "raising");
  assert.equal(classifyStage(450, shells, "2024-01-01", now), "descending");
  assert.equal(classifyStage(NaN, shells, "2024-01-01", now), "unknown");
});

test("arrival rate and Little's Law; an idle line gives null, not zero", () => {
  const now = new Date("2026-11-07T00:00:00Z");
  const dates = [...Array(45).fill("2026-10-01"), "2025-01-01"];
  const r = arrivalRatePerDay(dates, now, 90);
  assert.equal(r, 45 / 90);
  assert.equal(littleLawDays(10, r), 20);
  assert.equal(littleLawDays(10, 0), null);
});

test("countByMonth groups and sorts", () => {
  assert.deepEqual(countByMonth(["2026-07-02", "2026-07-30", "2026-01-05", null]), [
    { month: "2026-01", count: 1 }, { month: "2026-07", count: 2 },
  ]);
});

test("classifyStage: a gap between two shells is not on station; no launch date is unknown", () => {
  const shells = [{ minKm: 350, maxKm: 360, centerKm: 355, count: 1 }, { minKm: 460, maxKm: 490, centerKm: 475, count: 1 }];
  const now = new Date("2026-11-07T00:00:00Z");
  assert.equal(classifyStage(410, shells, "2026-10-20", now), "raising");
  assert.equal(classifyStage(410, shells, "2023-01-01", now), "descending");
  assert.equal(classifyStage(410, shells, null, now), "unknown");
  assert.equal(classifyStage(560, shells, "2023-01-01", now), "onStation");
  assert.equal(classifyStage(355, shells, "2023-01-01", now), "onStation");
});
