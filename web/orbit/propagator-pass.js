// Next-pass requests, shared by the worker and the main-thread fallback.
// passes.js imports satellite.js by bare name, which a module Worker cannot
// resolve (import maps do not reach workers), so loading it can fail there;
// callers treat that as "unsupported" and run it on the main thread instead.

/** noradId -> index map for a list of OMMs. */
export function noradIndexOf(omms) {
  const m = new Map();
  omms.forEach((o, i) => { const raw = o && o.NORAD_CAT_ID, id = Number(raw); if (raw != null && Number.isFinite(id)) m.set(id, i); });
  return m;
}

/**
 * Run nextPass for one satrec. `passes` is the passes.js module. `obs` is
 * { name, latDeg, lonDeg, heightKm }; `fromMs` epoch ms. Returns the pass or null.
 */
export function runNextPass(passes, satrec, obs, fromMs, opts) {
  if (!passes || typeof passes.nextPass !== "function") throw new Error("passes.js has no nextPass");
  if (!satrec) return null;
  if (!obs || !Number.isFinite(obs.latDeg) || !Number.isFinite(obs.lonDeg)) throw new Error("bad observer");
  if (!Number.isFinite(fromMs)) throw new Error("bad start time");
  return passes.nextPass(satrec, { heightKm: 0, ...obs }, new Date(fromMs), opts) ?? null;
}
