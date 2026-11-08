// Module worker: owns the satrecs, answers one tick message with one sweep and
// nextPass requests with the first pass. satellite.js comes from the CDN by full
// URL because import maps do not reliably apply inside workers. The pure logic
// lives in propagator-core.js and propagator-pass.js.
import { buildSatrecs, sweep } from "./propagator-core.js";
import { noradIndexOf, runNextPass } from "./propagator-pass.js";

const SAT_URL = "https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm";
let lib = null;
let satrecs = [];
let index = new Map();
let passesPromise = null;

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "init") {
      lib = await import(SAT_URL);
      satrecs = buildSatrecs(lib, msg.omms || []);
      index = noradIndexOf(msg.omms || []);
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
    } else if (msg.type === "nextPass") {
      await answerNextPass(msg);
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};

async function answerNextPass(msg) {
  let passes;
  try {
    passesPromise ||= import("./passes.js");
    passes = await passesPromise;
  } catch (err) {
    passesPromise = null;
    // Bare "satellite.js" does not resolve in a worker: ask the page to run it.
    self.postMessage({ type: "nextPass", id: msg.id, unsupported: true, message: String(err && err.message || err) });
    return;
  }
  try {
    const t0 = performance.now();
    const pass = runNextPass(passes, satrecs[index.get(Number(msg.noradId))], msg.obs, msg.fromMs);
    self.postMessage({ type: "nextPass", id: msg.id, pass, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ type: "nextPass", id: msg.id, failed: true, message: String(err && err.message || err) });
  }
}
