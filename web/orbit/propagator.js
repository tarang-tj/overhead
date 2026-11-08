// Main-thread client for the propagation worker. start(sats) -> ticks at 1 Hz,
// latest() -> newest sweep, dispose(). Falls back to main-thread sweeps when a
// module Worker cannot be created or its satellite.js CDN import fails.
import * as satLib from "satellite.js";
import { sunEciUnit } from "./sky.js";
import { buildSatrecs, sweep } from "./propagator-core.js";
import { noradIndexOf, runNextPass } from "./propagator-pass.js";

const PASS_TIMEOUT_MS = 15000;

export function createPropagator({ now = () => new Date(), intervalMs = 1000 } = {}) {
  let worker = null;
  let satrecs = null; // only set in fallback mode
  let omms = [];
  let timer = null;
  let busy = false;
  let ready = false;
  let disposed = false;
  let newest = null;
  const listeners = new Set();
  const pending = new Map(); // nextPass id -> { resolve, reject, timer, req }
  let workerPassesUnsupported = false, passSeq = 0, noradIdx = null, passesMod = null, lastPassMs = null;

  function publish(res) {
    newest = res;
    for (const fn of listeners) {
      try { fn(res); } catch (err) { console.warn("[propagator] listener failed", err); }
    }
  }

  function fallbackTick() {
    if (!satrecs) satrecs = buildSatrecs(satLib, omms);
    const date = now();
    const positions = new Float32Array(satrecs.length * 3);
    const flags = new Uint8Array(satrecs.length);
    const t0 = performance.now();
    const valid = sweep(satLib, satrecs, date, sunEciUnit(date), positions, flags);
    publish({ timeMs: date.getTime(), positions, flags, valid, ms: performance.now() - t0 });
  }

  function useFallback(reason) {
    if (worker) { worker.terminate(); worker = null; }
    ready = false;
    console.warn(`[propagator] using main-thread propagation (${reason})`);
    busy = false;
    for (const id of [...pending.keys()]) finishPass(id, (p) => mainThreadPass(p.req).then(p.resolve, p.reject));
  }

  function tick() {
    if (disposed || busy) return;
    if (worker && !ready) return; // init still importing satellite.js
    if (!worker) { try { fallbackTick(); } catch (err) { console.warn("[propagator] sweep failed", err); } return; }
    busy = true;
    const date = now();
    worker.postMessage({ type: "tick", timeMs: date.getTime(), sun: sunEciUnit(date) });
  }

  function startWorker() {
    try {
      worker = new Worker(new URL("./propagator-worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      useFallback(err.message);
      return;
    }
    worker.onerror = (e) => useFallback(e.message || "worker error");
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "ready") { ready = true; tick(); }
      else if (m.type === "positions") { busy = false; publish(m); }
      else if (m.type === "nextPass") settlePass(m);
      else if (m.type === "error") useFallback(m.message);
    };
    worker.postMessage({ type: "init", omms });
  }

  function finishPass(id, fn) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    fn(p);
  }

  async function mainThreadPass(req) {
    passesMod ||= await import("./passes.js");
    noradIdx ||= noradIndexOf(omms);
    const i = noradIdx.get(Number(req.noradId));
    const t0 = performance.now();
    const rec = i === undefined ? null : satLib.json2satrec(omms[i]);
    const pass = runNextPass(passesMod, rec && !rec.error ? rec : null, req.obs, req.fromMs);
    lastPassMs = performance.now() - t0;
    return pass;
  }

  let warnedPassFallback = false;
  function settlePass(m) {
    finishPass(m.id, (p) => {
      if (m.unsupported) {
        workerPassesUnsupported = true;
        // Expected in browsers (module workers cannot resolve the bare satellite.js import); warn once.
        if (!warnedPassFallback) console.warn(`[propagator] nextPass runs on the main thread (${m.message})`);
        warnedPassFallback = true;
        mainThreadPass(p.req).then(p.resolve, p.reject);
      } else if (m.failed) p.reject(new Error(m.message));
      else { lastPassMs = m.ms; p.resolve(m.pass ?? null); }
    });
  }

  function restartTimer(ms) {
    clearInterval(timer);
    timer = disposed ? null : setInterval(tick, ms);
  }

  return {
    /** @param {{omm:object}[]} sats */
    start(sats) {
      omms = sats.map((s) => s.omm);
      if (typeof Worker === "function") startWorker();
      else useFallback("no Worker support");
      if (!worker) tick();
      restartTimer(intervalMs);
    },
    /** Sweep cadence: 1000 normally, shorter while time-lapsing so lerps stay short in sim time. */
    setIntervalMs(ms) { if (Number.isFinite(ms) && ms >= 16) { intervalMs = ms; if (timer) restartTimer(ms); } },
    /** Sweep now (after a time jump) unless one is already in flight. */
    tickNow() { tick(); },
    /**
     * First pass of one satellite over `obs` after `from`, or null. Runs in the
     * worker when it can load passes.js, else on the main thread.
     */
    requestNextPass(noradId, obs, from = now()) {
      const req = { noradId, obs, fromMs: from instanceof Date ? from.getTime() : Number(from) };
      if (!worker || !ready || workerPassesUnsupported) return mainThreadPass(req);
      return new Promise((resolve, reject) => {
        const id = ++passSeq;
        const timer = setTimeout(() => finishPass(id, (p) => p.reject(new Error("nextPass timed out"))), PASS_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer, req });
        worker.postMessage({ type: "nextPass", id, ...req });
      });
    },
    /** Duration (ms) of the last nextPass computation, or null. */
    get lastPassMs() { return lastPassMs; },
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    latest() { return newest; },
    dispose() {
      disposed = true;
      clearInterval(timer);
      if (worker) worker.terminate();
      worker = null;
      listeners.clear();
      for (const id of [...pending.keys()]) finishPass(id, (p) => p.reject(new Error("propagator disposed")));
    },
  };
}
