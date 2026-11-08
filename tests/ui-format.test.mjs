import test from "node:test";
import assert from "node:assert/strict";
import { direction16, formatLocalTime, formatLocalDate, relativeAge, funnelRows, lastMonths } from "../web/ui/format.js";
import { pointingFromOrientation, uncertaintyFrom, readoutText, alphaFromCompassHeading, throttle } from "../web/ui/look-model.js";

test("direction16 maps and wraps", () => {
  assert.equal(direction16(0), "N");
  assert.equal(direction16(22), "NNE");
  assert.equal(direction16(135), "SE");
  assert.equal(direction16(359), "N");
  assert.equal(direction16(-10), "N");
  assert.equal(direction16(NaN), "?");
});

test("formatLocalTime uses Pacific time with a plain space", () => {
  assert.equal(formatLocalTime("2026-11-08T02:12:00Z"), "6:12 PM"); // PST (UTC-8) after Nov 1 2026 DST end
  assert.equal(formatLocalTime("2026-07-08T01:12:00Z"), "6:12 PM"); // PDT (UTC-7)
  assert.equal(formatLocalTime("nope"), "?");
  assert.equal(formatLocalDate("2026-11-07T06:00:00Z"), "Nov 6, 2026");
});

test("relativeAge", () => {
  assert.equal(relativeAge(10_000), "just now");
  assert.equal(relativeAge(5 * 60_000), "5 min");
  assert.equal(relativeAge(2 * 3600_000), "2 h");
  assert.equal(relativeAge(72 * 3600_000), "3 d");
  assert.equal(relativeAge(-5), "unknown age");
});

test("funnelRows percent of launched, tolerant of zero and missing", () => {
  const r = funnelRows({ launched: 200, raising: 50, onStation: 120, descending: 10, decayed: 20 });
  assert.deepEqual(r.map((x) => x.pct), [100, 25, 60, 5, 10]);
  assert.deepEqual(funnelRows({}).map((x) => x.pct), [0, 0, 0, 0, 0]);
  assert.equal(funnelRows({ launched: 10, raising: 99 })[1].pct, 100);
});

test("lastMonths pads to n months ending at the generation month", () => {
  const m = lastMonths([{ month: "2026-10", count: 3 }, { month: "2024-01", count: 9 }], "2026-11-07T00:00:00Z", 24);
  assert.equal(m.length, 24);
  assert.equal(m[23].month, "2026-11");
  assert.equal(m[22].count, 3);
  assert.equal(m[0].month, "2024-12"); // 2024-01 falls outside the window
  assert.equal(m.some((x) => x.count === 9), false);
});

test("pointingFromOrientation: upright phone faces magnetic heading plus declination", () => {
  const p = pointingFromOrientation(0, 90, 0, 15);
  assert.ok(Math.abs(p.el) < 1e-6);
  assert.ok(Math.abs(p.az - 15) < 1e-6);
  const up = pointingFromOrientation(0, 120, 0, 0); // leaned back 30 deg, camera tilts up
  assert.ok(Math.abs(up.el - 30) < 1e-6);
  const east = pointingFromOrientation(alphaFromCompassHeading(90), 90, 0, 0); // heading 90 = east
  assert.ok(Math.abs(east.az - 90) < 1e-6);
});

test("uncertaintyFrom and readout", () => {
  assert.equal(uncertaintyFrom(-1), null);
  assert.equal(uncertaintyFrom(undefined), null);
  assert.equal(uncertaintyFrom(12), 12);
  assert.equal(readoutText(22, 35, null), "Facing NNE 22 deg, up 35 deg");
  assert.match(readoutText(22, 35, 12), /accuracy about 12 deg/);
});

test("throttle limits to the rate and delivers the last value", () => {
  let now = 0; const calls = []; const timers = [];
  const t = throttle((v) => calls.push(v), 30, () => now, (fn) => timers.push(fn));
  t(1); now = 5; t(2); now = 10; t(3);
  assert.deepEqual(calls, [1]);
  assert.equal(timers.length, 1);
  now = 40; timers[0]();
  assert.deepEqual(calls, [1, 3]);
});
