// Renderer queries: tap-to-pick, "what's that light", per-satellite state card.
// All follow the simulated clock and the current observer.
import * as THREE from "three";
import * as satLib from "satellite.js";
import { enuBasisEci, observerEci, R_KM } from "./frames.js";
import { PICK_RADIUS_PX, behindSphere, nearestProjected } from "./pick-math.js";
import { belowHorizon, coarseCandidates, identifyExact, stateOf } from "./sat-queries.js";

export function createQueries({ sats, satsObj, camera, canvas, getObs, getMode, simNow, getSweepMs, getProfile = () => null }) {
  const noradIndex = new Map(sats.map((s, i) => [Number(s.noradId), i]));
  const recs = new Map();
  const satrecAt = (i) => {
    if (!recs.has(i)) {
      let r = null;
      try { r = satLib.json2satrec(sats[i].omm); if (r && r.error) r = null; } catch { r = null; }
      recs.set(i, r);
    }
    return recs.get(i);
  };
  const viewProj = new THREE.Matrix4();
  let lastPickMs = 0, lastIdentifyMs = 0;

  return {
    noradIndex,
    stats: () => ({ lastPickMs, lastIdentifyMs }),
    /** Nearest visible satellite within 14 CSS px of a client point, or null. Orbit and look modes only. */
    pickAt(clientX, clientY) {
      const mode = getMode();
      const latest = satsObj.latest;
      if (!latest || !["orbit", "lookup", "tonight"].includes(mode) || !Number.isFinite(clientX + clientY)) return null;
      const t0 = performance.now();
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      camera.updateMatrixWorld();
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const shown = satsObj.shown, cat = satsObj.categoryIdx, flags = satsObj.flags;
      let skip;
      if (mode === "orbit") {
        const cam = camera.position;
        skip = (i, x, y, z) => (shown && !shown[cat[i]]) || behindSphere(cam, { x, y, z }, R_KM);
      } else {
        const obs = getObs(), date = simNow();
        const o = observerEci(obs.latDeg, obs.lonDeg, obs.heightKm ?? 0, date), basis = enuBasisEci(obs.latDeg, obs.lonDeg, date), prof = getProfile();
        skip = (i, x, y, z) => (shown && !shown[cat[i]]) || belowHorizon(o, basis, prof, x, y, z);
      }
      const i = nearestProjected(satsObj.positions, flags, viewProj.elements, rect.width, rect.height, clientX - rect.left, clientY - rect.top, PICK_RADIUS_PX, skip);
      lastPickMs = performance.now() - t0;
      return i < 0 ? null : Number(sats[i].noradId);
    },
    /** Satellites within coneDeg of a sky direction for the current observer and sim time, nearest first. */
    identifyAt(azDeg, elDeg, coneDeg = 5) {
      const latest = satsObj.latest;
      if (!latest || !Number.isFinite(azDeg + elDeg)) return [];
      const t0 = performance.now();
      const obs = getObs(), date = simNow();
      const o = observerEci(obs.latDeg, obs.lonDeg, obs.heightKm ?? 0, date), basis = enuBasisEci(obs.latDeg, obs.lonDeg, date);
      // The sweep can lag the sim clock (up to ~1 s, a LEO moves ~1 deg/s near zenith): widen the coarse cone by that.
      const lagS = Math.abs(date.getTime() - getSweepMs()) / 1000;
      const cand = coarseCandidates(latest, satsObj.flags, o, basis, azDeg, elDeg, Math.min(180, coneDeg + 2 + 1.2 * lagS));
      const out = identifyExact(cand, satrecAt, date, obs, azDeg, elDeg, coneDeg, (i) => Number(sats[i].noradId), getProfile());
      lastIdentifyMs = performance.now() - t0;
      return out;
    },
    /** Live numbers for one satellite at sim time, or null for an unknown or decayed id. */
    satState(noradId) {
      const i = noradIndex.get(Number(noradId));
      const rec = i === undefined ? null : satrecAt(i);
      return rec ? stateOf(rec, simNow(), getObs()) : null;
    },
  };
}
