// All satellites as one THREE.Points: per-vertex RGBA (constellation tint,
// dimmed in Earth's shadow), positions lerped between 1 Hz sweeps.
import * as THREE from "three";

export const LEO_RGB = [0.961, 0.647, 0.141];  // #f5a524 amber
export const STARLINK_RGB = [0.62, 0.773, 1.0];   // #9ec5ff cool blue
const RAISING_RGB = [0.498, 0.839, 0.627];    // #7fd6a0 green
const DESCENDING_RGB = [1.0, 0.541, 0.502];   // #ff8a80 red
const ON_STATION_DIM = 0.78;
const STAGE_POP = 2.4; // raising/descending points are drawn larger in stage mode so the few stand out
const SHADOW_ALPHA = 0.28;

/** noradId -> 1 (raising) / 2 (descending) from line.json stageIds; everything else is on station (0). */
export function stageCodes(sats, line) {
  const code = new Map();
  for (const c of Object.values(line?.constellations || {})) {
    for (const id of c.stageIds?.raising || []) code.set(Number(id), 1);
    for (const id of c.stageIds?.descending || []) code.set(Number(id), 2);
  }
  return Uint8Array.from(sats, (s) => code.get(Number(s.noradId)) || 0);
}

/** RGB for one satellite given its constellation (0 leo, 1 starlink), stage code and mode. */
export function colorFor(constellation, stage, mode) {
  const base = constellation === 0 ? LEO_RGB : STARLINK_RGB;
  if (mode !== "stage") return base;
  if (stage === 1) return RAISING_RGB;
  if (stage === 2) return DESCENDING_RGB;
  return base.map((v) => v * ON_STATION_DIM);
}

const VERT = `attribute vec4 aColor; attribute float aSize; uniform float size; varying vec4 vC;
void main(){ vC = aColor; gl_PointSize = size * aSize; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FRAG = `varying vec4 vC; uniform float ringShadow;
void main(){ vec2 d = gl_PointCoord-0.5; float r = length(d); if (r>0.5 || vC.a<0.01) discard;
  if (ringShadow > 0.5 && vC.a < 0.9) { // Earth's shadow: hollow ring, clearly a satellite but not lit
    gl_FragColor = vec4(vC.rgb, 0.9*smoothstep(0.26,0.34,r)*smoothstep(0.5,0.42,r)); return; }
  vec3 c = mix(vC.rgb, vec3(1.0), smoothstep(0.22,0.0,r)*0.55*vC.a);
  gl_FragColor = vec4(c, vC.a*smoothstep(0.5,0.3,r)); }`;

export function createSatPoints({ sats, line, pixelRatio = 1 }) {
  const n = sats.length;
  const cIdx = new Uint8Array(n); // 0 leo, 1 starlink
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    cIdx[i] = sats[i].constellation === "leo" ? 0 : 1;
    const rgb = LEO_RGB;
    col.set([rgb[0], rgb[1], rgb[2], 0], i * 4);
  }
  const stage = stageCodes(sats, line);
  const sizes = new Float32Array(n).fill(1);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  function recolor(mode) {
    for (let i = 0; i < n; i++) {
      col.set(colorFor(cIdx[i], stage[i], mode), i * 4);
      sizes[i] = mode === "stage" && stage[i] ? STAGE_POP : 1;
    }
    colAttr.needsUpdate = sizeAttr.needsUpdate = true;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("aColor", colAttr);
  geo.setAttribute("aSize", sizeAttr);
  const mat = new THREE.ShaderMaterial({
    uniforms: { size: { value: 2.2 * pixelRatio }, ringShadow: { value: 0 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false,
  });
  recolor("constellation");
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;

  let prev = null, next = null, flags = null, t0 = 0, vPrev = null, vDt = 0, lastTime = 0;

  return {
    points, constellationIdx: cIdx, recolor,
    /** Velocity (km/s) from the last two sweeps; zeros until the second one arrives. */
    velocityOf(i, out) {
      if (!vPrev || !next || flags[i] === 2) return out.set(0, 0, 0);
      return out.set((next[3 * i] - vPrev[3 * i]) / vDt, (next[3 * i + 1] - vPrev[3 * i + 1]) / vDt, (next[3 * i + 2] - vPrev[3 * i + 2]) / vDt);
    },
    /** Look Up draws shadowed satellites as hollow rings; orbit views keep dim dots. */
    setSize(px, ringShadow = false) { mat.uniforms.size.value = px * pixelRatio; mat.uniforms.ringShadow.value = ringShadow ? 1 : 0; },
    /** Feed a sweep: { positions: Float32Array, flags: Uint8Array } */
    push(sweep, nowMs) {
      if (!sweep || sweep.positions.length !== n * 3) return;
      const prevFlags = flags;
      vPrev = next; vDt = next ? Math.max(0.2, (sweep.timeMs - lastTime) / 1000) : 0; lastTime = sweep.timeMs;
      prev = next ? Float32Array.from(pos) : sweep.positions;
      next = sweep.positions; flags = sweep.flags; t0 = nowMs;
      for (let i = 0; i < n; i++) {
        col[i * 4 + 3] = flags[i] === 2 ? 0 : flags[i] === 1 ? SHADOW_ALPHA : 1;
        if (prevFlags && prevFlags[i] === 2) { // snap, do not streak in from the origin
          prev[3 * i] = next[3 * i]; prev[3 * i + 1] = next[3 * i + 1]; prev[3 * i + 2] = next[3 * i + 2];
        }
      }
      colAttr.needsUpdate = true;
    },
    /** Advance interpolation to wall-clock `nowMs`. Returns false before the first sweep. */
    update(nowMs, spanMs = 1000) {
      if (!next) return false;
      const a = Math.min(1, Math.max(0, (nowMs - t0) / spanMs));
      for (let i = 0; i < pos.length; i++) pos[i] = prev[i] + (next[i] - prev[i]) * a;
      posAttr.needsUpdate = true;
      return true;
    },
    get latest() { return next; },
    get flags() { return flags; },
    positionOf(i, out) { return out.set(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/** Single bright point that follows one satellite. */
export function createHighlight(pixelRatio = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1]), 4));
  geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array([1]), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { size: { value: 12 * pixelRatio } },
    vertexShader: VERT, fragmentShader: FRAG.replace("uniform float ringShadow;", "const float ringShadow = 0.0;"), transparent: true, depthWrite: false, depthTest: false,
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 20;
  obj.visible = false;
  return { obj, dispose() { geo.dispose(); mat.dispose(); } };
}
