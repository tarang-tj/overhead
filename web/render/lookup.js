// Look Up scene: sky dome gradient, terrain silhouette, peak labels and the
// compass-uncertainty ring, all in a local east/north/up group (x E, y N, z up)
// that the renderer pins to UW Bothell every frame.
import * as THREE from "three";
import { buildHorizonRing, dirEnu, uncertaintyRing } from "./horizon-geom.js";
import { labelTexture } from "./markers.js";

export const HORIZON_RADIUS_KM = 200;
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Sky gradient colours (linear-ish rgb 0..1) for a sun elevation in degrees. */
export function skyColors(sunElDeg) {
  const night = { z: [0.008, 0.012, 0.035], h: [0.03, 0.05, 0.09] };
  const dusk = { z: [0.05, 0.08, 0.2], h: [0.6, 0.32, 0.2] };
  const day = { z: [0.12, 0.38, 0.8], h: [0.6, 0.76, 0.92] };
  let z, h;
  if (sunElDeg <= -6) { const t = clamp01((sunElDeg + 18) / 12); z = lerp3(night.z, dusk.z, t); h = lerp3(night.h, dusk.h, t); }
  else { const t = clamp01((sunElDeg + 6) / 12); z = lerp3(dusk.z, day.z, t); h = lerp3(dusk.h, day.h, t); }
  return { zenith: z, horizon: h, starAlpha: clamp01((-sunElDeg - 4) / 10) };
}

export function createLookup() {
  const group = new THREE.Group();
  const disposables = [];

  const domeMat = new THREE.ShaderMaterial({
    uniforms: { zenith: { value: new THREE.Color() }, horizonCol: { value: new THREE.Color() } },
    vertexShader: `varying float vZ; void main(){ vZ = normalize(position).z; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizonCol; varying float vZ;
      void main(){ float t = pow(clamp(vZ,0.0,1.0), 0.55); gl_FragColor = vec4(mix(horizonCol, zenith, t), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const domeGeo = new THREE.SphereGeometry(1.2e5, 32, 16);
  domeGeo.rotateX(Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  group.add(dome);
  disposables.push(domeGeo, domeMat);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x04060a, side: THREE.DoubleSide });
  let ring = null;
  function setProfile(profile) {
    if (ring) { group.remove(ring); ring.geometry.dispose(); }
    const { positions, indices } = buildHorizonRing(profile, HORIZON_RADIUS_KM);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    ring = new THREE.Mesh(g, ringMat);
    ring.renderOrder = 5;
    group.add(ring);
  }
  setProfile(null);
  disposables.push(ringMat);

  const peakGroup = new THREE.Group();
  group.add(peakGroup);
  function setPeaks(peaks) {
    for (const c of [...peakGroup.children]) { peakGroup.remove(c); c.material.map.dispose(); c.material.dispose(); }
    for (const p of peaks || []) {
      if (!Number.isFinite(p.azDeg) || !Number.isFinite(p.elDeg)) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(p.name, "#c8d4e6"), depthTest: false, transparent: true, sizeAttenuation: false }));
      const d = dirEnu(p.azDeg, p.elDeg + 1.2);
      s.position.set(d[0] * 190, d[1] * 190, d[2] * 190);
      s.center.set(0.5, 0);
      s.scale.set(0.34, 0.0425, 1);
      s.renderOrder = 6;
      peakGroup.add(s);
    }
  }

  const uncGeo = new THREE.BufferGeometry();
  const uncMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, depthTest: false });
  const unc = new THREE.LineLoop(uncGeo, uncMat);
  unc.visible = false;
  unc.renderOrder = 7;
  group.add(unc);
  disposables.push(uncGeo, uncMat);
  function setUncertainty(az, el, deg) {
    if (!Number.isFinite(deg) || deg <= 0) { unc.visible = false; return; }
    uncGeo.setAttribute("position", new THREE.BufferAttribute(uncertaintyRing(az, el, deg, 150), 3));
    unc.visible = true;
  }

  return {
    group,
    setProfile, setPeaks, setUncertainty,
    setSky(sunElDeg) {
      const c = skyColors(sunElDeg);
      domeMat.uniforms.zenith.value.setRGB(...c.zenith);
      domeMat.uniforms.horizonCol.value.setRGB(...c.horizon);
      return c;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      if (ring) ring.geometry.dispose();
      setPeaks([]);
    },
  };
}
