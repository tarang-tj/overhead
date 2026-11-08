import { test } from "node:test";
import assert from "node:assert/strict";
import { createSimClock } from "../web/render/sim-clock.js";

function fakeWall(start) {
  let t = start;
  return { wall: () => new Date(t), advance: (ms) => { t += ms; } };
}

test("live clock follows the wall clock", () => {
  const w = fakeWall(1_000_000);
  const c = createSimClock(w.wall);
  assert.equal(c.live, true);
  w.advance(5000);
  assert.equal(c.now().getTime(), 1_005_000);
});

test("setTime pins a start and advances in real time from there", () => {
  const w = fakeWall(1_000_000);
  const c = createSimClock(w.wall);
  c.setTime(new Date(500_000));
  assert.equal(c.live, false);
  w.advance(2000);
  assert.equal(c.now().getTime(), 502_000);
});

test("setSpeed multiplies elapsed wall time and does not jump the clock", () => {
  const w = fakeWall(1_000_000);
  const c = createSimClock(w.wall);
  w.advance(1000);
  c.setSpeed(60);
  assert.equal(c.now().getTime(), 1_001_000);
  w.advance(1000);
  assert.equal(c.now().getTime(), 1_001_000 + 60_000);
  c.setSpeed(600);
  w.advance(1000);
  assert.equal(c.now().getTime(), 1_001_000 + 60_000 + 600_000);
});

test("setTime(null) returns to live and resets speed", () => {
  const w = fakeWall(1_000_000);
  const c = createSimClock(w.wall);
  c.setTime(new Date(0)); c.setSpeed(600);
  c.setTime(null);
  assert.equal(c.live, true);
  assert.equal(c.speed, 1);
  w.advance(3000);
  assert.equal(c.now().getTime(), 1_003_000);
});

test("invalid inputs are ignored", () => {
  const w = fakeWall(1_000_000);
  const c = createSimClock(w.wall);
  const warn = console.warn; console.warn = () => {};
  try { c.setTime(new Date("nope")); c.setSpeed(0); c.setSpeed(NaN); c.setSpeed(-5); } finally { console.warn = warn; }
  assert.equal(c.live, true);
  assert.equal(c.now().getTime(), 1_000_000);
});
