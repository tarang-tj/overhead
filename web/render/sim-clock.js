// Simulated clock. Live = wall clock. setTime(date) pins a start; sim time then
// advances from it at `speed` x real time. setTime(null) returns to the wall clock
// and resets speed to 1. setSpeed re-anchors at the current sim time, so changing
// speed never jumps the clock. `wall` is injectable for tests.
export function createSimClock(wall = () => new Date()) {
  let anchorSim = null, anchorWall = 0, speed = 1;
  const nowMs = () => {
    const w = wall().getTime();
    return anchorSim === null && speed === 1 ? w : (anchorSim ?? w) + (w - anchorWall) * speed;
  };
  return {
    now: () => new Date(nowMs()),
    setTime(date) {
      if (date == null) { anchorSim = null; speed = 1; return; }
      const t = date instanceof Date ? date.getTime() : Number(date);
      if (!Number.isFinite(t)) { console.warn("[clock] ignoring invalid time"); return; }
      anchorSim = t; anchorWall = wall().getTime();
    },
    setSpeed(x) {
      const s = Number(x);
      if (!Number.isFinite(s) || s <= 0) { console.warn("[clock] ignoring invalid speed"); return; }
      const cur = nowMs();
      anchorSim = cur; anchorWall = wall().getTime(); speed = s;
    },
    get speed() { return speed; },
    get live() { return anchorSim === null && speed === 1; },
  };
}
