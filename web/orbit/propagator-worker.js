// Module worker: owns the satrecs, answers one tick message with one sweep.
// satellite.js comes from the CDN by full URL because import maps do not
// reliably apply inside workers. The pure logic lives in propagator-core.js.
import { buildSatrecs, sweep } from "./propagator-core.js";

const SAT_URL = "https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm";
let lib = null;
let satrecs = [];

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "init") {
      lib = await import(SAT_URL);
      satrecs = buildSatrecs(lib, msg.omms || []);
      self.postMessage({ type: "ready", count: satrecs.length });
    } else if (msg.type === "tick") {
      if (!lib) throw new Error("tick before init");
      const n = satrecs.length;
      const positions = new Float32Array(n * 3);
      const flags = new Uint8Array(n);
      const t0 = performance.now();
      const valid = sweep(lib, satrecs, new Date(msg.timeMs), msg.sun, positions, flags);
      self.postMessage(
        { type: "positions", timeMs: msg.timeMs, positions, flags, valid, ms: performance.now() - t0 },
        [positions.buffer, flags.buffer],
      );
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
