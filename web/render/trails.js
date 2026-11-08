// One reused LineSegments buffer for motion trails.
//  - Look Up / Tonight: a ~12 s fading tail (a LEO pass sweeps about 1 deg/s, so 60 s drew sky-wide streaks) behind up to MAX_TRAILS satellites above the horizon
//    (straight back along the last-sweep velocity; the arc error is negligible at 12 s).
//  - Orbit: a ~10 min arc (5 min back, 5 min forward) for the highlighted satellite, propagated
//    with satellite.js.
import * as THREE from "three";
import * as satLib from "satellite.js";
import { eciAt } from "../orbit/sky.js";
import { LEO_RGB, STARLINK_RGB } from "./sats.js";

export const MAX_TRAILS = 300;
export const TRAIL_SECONDS = 12;
const TRAIL_SEGS = 8;
const ARC_SEGS = 20, ARC_HALF_S = 300;
const CAP = MAX_TRAILS * TRAIL_SEGS * 2;

/** Vertex positions + alpha for one trail tail. Pure: head, velocity (km/s) -> segments written at `at`. */
export function writeTail(pos, alpha, at, head, vel, baseAlpha, seconds = TRAIL_SECONDS, segs = TRAIL_SEGS) {
  const dt = seconds / segs;
  for (let k = 0; k < segs; k++) {
    for (let e = 0; e < 2; e++) {
      const t = (k + e) * dt, v = (at + k * 2 + e);
      pos[3 * v] = head.x - vel.x * t; pos[3 * v + 1] = head.y - vel.y * t; pos[3 * v + 2] = head.z - vel.z * t;
      alpha[v] = baseAlpha * (1 - t / seconds);
    }
  }
  return at + segs * 2;
}

export function createTrails({ sats, satsObj }) {
  const pos = new Float32Array(CAP * 3), rgba = new Float32Array(CAP * 4), alpha = new Float32Array(CAP);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(rgba, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("aColor", colAttr);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: "attribute vec4 aColor; varying vec4 vC; void main(){ vC = aColor; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "varying vec4 vC; void main(){ gl_FragColor = vC; }",
    transparent: true, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 9;
  lines.visible = false;
  const head = new THREE.Vector3(), vel = new THREE.Vector3();
  let picks = [];
  let arcSatrec = null, arcIdx = -1;

  function paint(count, rgbOf) {
    for (let v = 0; v < count; v++) {
      const c = rgbOf(v);
      rgba[4 * v] = c[0]; rgba[4 * v + 1] = c[1]; rgba[4 * v + 2] = c[2]; rgba[4 * v + 3] = alpha[v];
    }
    posAttr.needsUpdate = colAttr.needsUpdate = true;
    geo.setDrawRange(0, count);
  }

  return {
    obj: lines,
    /** Choose which visible satellites get trails (sunlit first). `visible` = indices above the horizon. */
    setPicks(visible, flags) {
      const lit = visible.filter((i) => flags[i] === 0), dark = visible.filter((i) => flags[i] === 1);
      picks = lit.concat(dark).slice(0, MAX_TRAILS);
    },
    /** Look Up / Tonight: rebuild every frame from the lerped head positions. */
    updateTails(on) {
      lines.visible = on && picks.length > 0;
      if (!lines.visible) return;
      let at = 0;
      for (const i of picks) {
        satsObj.positionOf(i, head); satsObj.velocityOf(i, vel);
        at = writeTail(pos, alpha, at, head, vel, satsObj.flags[i] === 1 ? 0.35 : 0.9);
      }
      const rgbs = picks.map((i) => (satsObj.constellationIdx[i] === 0 ? LEO_RGB : STARLINK_RGB));
      paint(at, (v) => rgbs[Math.floor(v / (TRAIL_SEGS * 2))]);
    },
    /** Orbit: arc for one satellite (index or -1), propagated around `date`. */
    updateArc(idx, date) {
      lines.visible = idx >= 0;
      if (idx < 0) { arcSatrec = null; arcIdx = -1; return; }
      if (idx !== arcIdx) {
        arcIdx = idx;
        try { arcSatrec = satLib.json2satrec(sats[idx].omm); } catch { arcSatrec = null; }
      }
      if (!arcSatrec) { lines.visible = false; return; }
      const pts = [];
      for (let k = 0; k <= ARC_SEGS; k++) {
        const t = date.getTime() + (-ARC_HALF_S + (k * 2 * ARC_HALF_S) / ARC_SEGS) * 1000;
        pts.push(eciAt(arcSatrec, new Date(t)));
      }
      let n = 0;
      for (let k = 0; k < ARC_SEGS; k++) {
        const a = pts[k], b = pts[k + 1];
        if (!a || !b) continue;
        for (const [p, f] of [[a, k], [b, k + 1]]) {
          pos[3 * n] = p.x; pos[3 * n + 1] = p.y; pos[3 * n + 2] = p.z;
          alpha[n] = f <= ARC_SEGS / 2 ? 0.2 + 0.6 * (f / (ARC_SEGS / 2)) : 0.8 - 0.4 * ((f - ARC_SEGS / 2) / (ARC_SEGS / 2));
          n++;
        }
      }
      const c = satsObj.constellationIdx[idx] === 0 ? LEO_RGB : STARLINK_RGB;
      paint(n, () => c);
    },
    hide() { lines.visible = false; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
