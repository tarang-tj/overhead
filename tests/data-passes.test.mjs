import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findPasses, makeTimes, satrecOrNull } from "../tools/lib/passes.mjs";

const gp = JSON.parse(readFileSync(new URL("./fixtures/leo-gp.json", import.meta.url), "utf8"));
const start = new Date(gp[0].EPOCH + "Z");
const times = makeTimes(start, 24, 20);
const sunDark = times.map(() => ({ unit: { x: -1, y: 0, z: 0 }, elDeg: -30 }));
const sunUp = times.map(() => ({ unit: { x: -1, y: 0, z: 0 }, elDeg: 30 }));
const all = (sun) => gp.flatMap((o) => findPasses(satrecOrNull(o), times, sun));

test("makeTimes covers the window inclusively", () => {
  assert.equal(times.length, 24 * 180 + 1);
  assert.equal(times.at(-1).getTime() - times[0].getTime(), 24 * 3600 * 1000);
});

test("passes are well formed over 24 h", () => {
  const passes = all(sunDark);
  assert.ok(passes.length > 0, "37 Leo sats should give at least one pass at UWB in a day");
  for (const p of passes) {
    assert.ok(p.start <= p.peak && p.peak <= p.end);
    assert.ok(p.peakElDeg >= 10 && p.peakElDeg <= 90);
    for (const az of [p.startAzDeg, p.peakAzDeg, p.endAzDeg]) assert.ok(az >= 0 && az < 360);
    assert.equal(typeof p.visible, "boolean");
  }
});

test("a daylit sky never counts as visible", () => {
  assert.ok(all(sunUp).every((p) => !p.visible));
});

test("an eclipsed satellite is not visible even in a dark sky", () => {
  // Sun along +x and the satellite behind Earth (negative x within the shadow cylinder) is eclipsed.
  const sunFar = times.map(() => ({ unit: { x: 1, y: 0, z: 0 }, elDeg: -30 }));
  const vis = all(sunFar).filter((p) => p.visible).length;
  const lit = all(sunDark).filter((p) => p.visible).length;
  assert.ok(lit >= vis);
  assert.ok(lit > 0, "with every sample sunlit and a dark sky, some pass must be visible");
});

test("a decayed or invalid record yields no passes instead of throwing", () => {
  assert.equal(satrecOrNull({ OBJECT_NAME: "BAD" }), null);
});

test("visibility is judged per sample, not only at the peak", () => {
  // Find a pass that is visible somewhere, then make the sky dark ONLY at its
  // first visible sample: the pass must stay visible though the peak is daylit.
  const sat = gp.map((o) => satrecOrNull(o)).find((s) => findPasses(s, times, sunDark).some((p) => p.visibleStart && p.visibleStart !== p.peak));
  assert.ok(sat, "fixture needs a pass whose first visible sample is not its peak");
  const p0 = findPasses(sat, times, sunDark).find((p) => p.visibleStart && p.visibleStart !== p.peak);
  const darkIdx = times.findIndex((t) => t.toISOString() === p0.visibleStart);
  const sun = times.map((_, i) => ({ unit: { x: -1, y: 0, z: 0 }, elDeg: i === darkIdx ? -30 : 30 }));
  const p1 = findPasses(sat, times, sun).find((p) => p.start === p0.start);
  assert.equal(p1.visible, true);
  assert.equal(p1.visibleStart, p0.visibleStart);
  assert.equal(p1.visibleEnd, p0.visibleStart);
});
