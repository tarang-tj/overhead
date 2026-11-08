import test from "node:test";
import assert from "node:assert/strict";
import { lineModel, impliedText, shellsText, FCC_COPY } from "../web/ui/line-model.js";
import { tonightModel, shareText, directionText } from "../web/ui/tonight-model.js";
import { badgeText } from "../web/ui/ui.js";

const con = (label, city, extra = {}) => ({
  label, factory: { city, note: "n", sources: ["https://example.com/a"] },
  shells: [{ minKm: 625, maxKm: 650, centerKm: 637, count: 100 }],
  stages: { launched: 200, raising: 40, onStation: 140, descending: 5, unknown: 3, decayed: 12 },
  launchesByMonth: [{ month: "2026-06", count: 4 }], decaysByMonth: [],
  sites: { AFETR: 5, ZZZZ: 9 }, lastLaunchDate: "2026-07-02", arrivalRatePerDay90: 0.5, impliedRaiseDays: 80, ...extra,
});
const line = { generatedAt: "2026-11-07T12:00:00Z", sources: { gp: { url: "https://celestrak.org/gp" }, satcat: { url: "https://celestrak.org/satcat" } },
  constellations: { leo: con("Amazon Leo", "Kirkland, WA", { impliedRaiseDays: null }), starlink: con("Starlink", "Redmond, WA") } };

const passes = { generatedAt: "2026-11-07T20:00:00Z", windowStart: "2026-11-08T01:00:00Z", windowEnd: "2026-11-08T13:00:00Z", minElDeg: 10,
  passes: [
    { constellation: "starlink", name: "STARLINK-1", noradId: 2, start: "2026-11-08T03:30:00Z", peak: "2026-11-08T03:34:00Z", end: "2026-11-08T03:38:00Z", peakElDeg: 54.4, peakAzDeg: 135, startAzDeg: 340, endAzDeg: 90, visible: true },
    { constellation: "leo", name: "KUIPER-9", noradId: 1, start: "2026-11-08T02:12:00Z", peak: "2026-11-08T02:15:00Z", end: "2026-11-08T02:18:00Z", peakElDeg: 30, peakAzDeg: 200, startAzDeg: 180, endAzDeg: 250, visible: true },
    { constellation: "leo", name: "KUIPER-3", noradId: 3, start: "2026-11-08T01:10:00Z", peak: "2026-11-08T01:12:00Z", end: "2026-11-08T01:14:00Z", peakElDeg: 15, peakAzDeg: 90, startAzDeg: 60, endAzDeg: 120, visible: false },
  ] };

test("line model: funnel, factory, sites, shells", () => {
  const m = lineModel(line);
  assert.equal(m.columns.length, 2);
  const [leo, sl] = m.columns;
  assert.equal(leo.factory.city, "Kirkland, WA");
  assert.equal(sl.factory.city, "Redmond, WA");
  assert.deepEqual(leo.funnel.map((r) => r.pct), [100, 20, 70, 2.5, 6]);
  assert.equal(leo.shells, "On station shells: 625-650 km");
  assert.deepEqual(leo.sites.map((s) => s.name), ["ZZZZ", "Cape Canaveral (AFETR)"]);
  assert.equal(leo.launches.length, 24);
  assert.equal(leo.lastLaunch, "Last Amazon Leo launch in the catalog: Jul 2, 2026");
  assert.equal(leo.fcc, FCC_COPY);
  assert.equal(sl.fcc, null);
  assert.equal(m.sources.length, 2);
});

test("implied raise copy, including idle line", () => {
  assert.equal(lineModel(line).columns[0].implied, "No launches in the catalog in the last 90 days, so Little's Law gives no raise time");
  assert.equal(lineModel(line).columns[1].implied, "Implied time to raise: 80 days (Little's Law: raising / launch rate over 90 days)");
  assert.equal(impliedText({ impliedRaiseDays: 80.4 }), "Implied time to raise: 80 days (Little's Law: raising / launch rate over 90 days)");
  assert.equal(shellsText([]), "On station shells: not available");
});

test("line model is null on missing or partial input", () => {
  assert.equal(lineModel(null), null);
  assert.equal(lineModel({ constellations: { leo: {} } }), null);
});

test("direction text and tonight rows", () => {
  assert.equal(directionText(passes.passes[0]), "rises NNW, peaks 54 deg SE, sets E");
  const vis = tonightModel(passes, { now: Date.parse("2026-11-08T02:00:00Z") });
  assert.deepEqual(vis.rows.map((r) => r.name), ["KUIPER-9", "STARLINK-1"]);
  assert.equal(vis.rows[0].time, "Nov 7, 6:12 PM");
  assert.equal(vis.rows[0].chip, "Amazon Leo");
  const all = tonightModel(passes, { showAll: true });
  assert.equal(all.rows.length, 3);
  assert.equal(all.rows[0].visible, false);
  assert.match(vis.note, /Brightness not modeled/);
});

test("share card text and singular form", () => {
  const early = Date.parse("2026-11-08T00:00:00Z");
  assert.equal(shareText(passes, early),
    "Tonight over UW Bothell: 2 visible satellite passes, first at 6:12 PM. Amazon Leo built in Kirkland, Starlink in Redmond. overhead");
  const one = { passes: [passes.passes[0]] };
  assert.match(shareText(one, early), /: 1 visible satellite pass, first at 7:30 PM\./);
  assert.match(shareText({ passes: [] }), /no visible satellite passes/);
});

test("empty visible state and missing data", () => {
  const none = { ...passes, passes: [passes.passes[2], { ...passes.passes[2], noradId: 4 }] };
  assert.equal(tonightModel(none).empty, "No naked-eye-friendly passes in this window. 2 passes overhead in daylight or shadow.");
  assert.equal(tonightModel(null), null);
  assert.equal(tonightModel({}), null);
});

test("badge text per mode", () => {
  const now = Date.parse("2026-11-07T14:00:00Z");
  assert.equal(badgeText({ mode: "live", fetchedAt: "2026-11-07T12:00:00Z" }, now), "Orbit data from CelesTrak, 2 h old");
  assert.equal(badgeText({ mode: "cache", fetchedAt: "2026-11-07T12:00:00Z" }, now), "Orbit data from CelesTrak (cached), 2 h old");
  assert.equal(badgeText({ mode: "snapshot", fetchedAt: "2026-11-06T20:00:00Z" }, now), "Saved snapshot from Nov 6, 2026");
  assert.equal(badgeText(null, now), "Orbit data age unknown");
});

test("clipped passes and visibleStart drive the copy; expired lists say so", () => {
  const p = { ...passes.passes[0], clippedStart: true, clippedEnd: true, visibleStart: "2026-11-08T03:32:00Z" };
  assert.equal(directionText(p), "already up in the NNW, peaks 54 deg SE, still up at the end of the list");
  const m = tonightModel({ ...passes, passes: [p] }, { now: Date.parse("2026-11-08T02:00:00Z") });
  assert.equal(m.rows[0].time, "Nov 7, 7:32 PM");
  assert.equal(m.stale, null);
  const late = tonightModel(passes, { now: Date.parse("2026-11-09T00:00:00Z") });
  assert.match(late.stale, /pass list ended/);
  assert.match(shareText(passes, Date.parse("2026-11-09T00:00:00Z")), /no visible satellite passes/);
});
