// Intro zoom timeline state. The clock starts once the campus imagery settled (or after 4 s)
// and each step is capped so a stalled frame never skips the shot.
import { ZOOM_SECONDS } from "./zoom.js";

export function createZoomDriver(imageryReady, onDone) {
  let t = 0, start = null, waitFrom = null, elapsed = 0, ready = false, resolve = null, promise = null;
  imageryReady.then(() => { ready = true; });
  const api = {
    get t() { return t; },
    get promise() { return promise; },
    get pending() { return resolve !== null; },
    reset() { t = 0; },
    finish() {
      t = 1; start = null; waitFrom = null;
      if (resolve) { resolve(); resolve = null; promise = null; }
      onDone();
    },
    play(instant) {
      if (promise) return promise;
      if (instant) { t = 1; return Promise.resolve(); }
      promise = new Promise((res) => { resolve = res; start = null; waitFrom = performance.now(); });
      return promise;
    },
    /** Advance one frame; returns t in [0,1]. */
    step(nowMs, lastMs) {
      if (start === null && waitFrom !== null && (ready || nowMs - waitFrom > 4000)) { start = nowMs; waitFrom = null; elapsed = 0; }
      if (start !== null) {
        elapsed += Math.min(nowMs - lastMs, 200);
        t = Math.min(1, elapsed / (ZOOM_SECONDS * 1000));
        if (t >= 1) api.finish();
      }
      return t;
    },
  };
  return api;
}
