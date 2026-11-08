// Main-thread client for the propagation worker. start(sats) -> ticks at 1 Hz,
// latest() -> newest sweep, dispose(). Falls back to main-thread sweeps when a
// module Worker cannot be created or its satellite.js CDN import fails.
import * as satLib from "satellite.js";
import { sunEciUnit } from "./sky.js";
import { buildSatrecs, sweep } from "./propagator-core.js";

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
      else if (m.type === "error") useFallback(m.message);
    };
    worker.postMessage({ type: "init", omms });
  }

  return {
    /** @param {{omm:object}[]} sats */
    start(sats) {
      omms = sats.map((s) => s.omm);
      if (typeof Worker === "function") startWorker();
      else useFallback("no Worker support");
      if (!worker) tick();
      timer = setInterval(tick, intervalMs);
    },
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    latest() { return newest; },
    dispose() {
      disposed = true;
      clearInterval(timer);
      if (worker) worker.terminate();
      worker = null;
      listeners.clear();
    },
  };
}
