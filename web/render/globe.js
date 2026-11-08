// Earth: GIBS day imagery + Black Marble night side blended by the real sun
// direction (adapted from go-for-dock, MIT). Starts instantly on procedural
// tints and swaps the real mosaics in when they arrive; offline stays procedural.
import * as THREE from "three";
import { TILE_MATRIX_250M, TILE_PX, tileUrl, yesterdayUtc } from "./gibs.js";
import { loadTileImage, makeCanvas } from "./tiles.js";
import { R_KM } from "./frames.js";

// Level 3 = two 5120x2560 canvases (~52 MB each): too much for older phones.
// Phone-sized screens use level 2 (2560x1536, ~16 MB each).
const SMALL_SCREEN = typeof innerWidth !== "undefined" && Math.min(innerWidth, innerHeight) < 700;
const LEVEL = SMALL_SCREEN ? 2 : 3;

async function mosaic(layer, date, tint) {
  const { width, height } = TILE_MATRIX_250M[LEVEL];
  const canvas = makeCanvas(width * TILE_PX, height * TILE_PX, tint);
  const ctx = canvas.getContext("2d");
  const jobs = [];
  let ok = 0;
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    jobs.push(loadTileImage(tileUrl(layer, date, LEVEL, r, c)).then((img) => {
      if (img) { ctx.drawImage(img, c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX); ok++; }
    }));
  }
  await Promise.allSettled(jobs);
  return ok > 0 ? canvas : null;
}

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const VERT = `varying vec3 vN; varying vec2 vUv;
void main(){ vN = normalize(mat3(modelMatrix)*normal); vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FRAG = `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir; uniform float nightGain; varying vec3 vN; varying vec2 vUv;
void main(){ float l = dot(normalize(vN), normalize(sunDir)); float m = smoothstep(-0.12, 0.12, l);
  vec3 day = texture2D(dayMap, vUv).rgb; vec3 night = texture2D(nightMap, vUv).rgb * nightGain;
  gl_FragColor = vec4(mix(night, day, m), 1.0); }`;

function atmosphere() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { glow: { value: new THREE.Color(0x8fc8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-(modelMatrix*vec4(position,1.0)).xyz);
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 glow; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0-max(dot(normalize(vN),normalize(vV)),0.0), 6.0); float g = smoothstep(0.08,0.85,f)*1.1;
      gl_FragColor = vec4(glow*g, g); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(R_KM * 1.006, 96, 64), mat);
}

/** Earth group in ECEF-local axes; rotate it about +z by GMST. Returns { group, setSun, dispose }. */
export function createEarth(now = new Date()) {
  const geo = new THREE.SphereGeometry(R_KM, 256, 128);
  geo.rotateX(Math.PI / 2); // poles on +z; u=0.5 (lon 0) lands on +x, east is +y
  const day = texture(makeCanvas(4, 2, "#1d3557"));
  const night = texture(makeCanvas(4, 2, "#02030a"));
  const mat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: day }, nightMap: { value: night }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, nightGain: { value: 1.6 } },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const atm = atmosphere();
  const group = new THREE.Group();
  group.add(mesh);
  let disposed = false;
  const owned = [day, night];

  Promise.all([
    mosaic("VIIRS_NOAA20_CorrectedReflectance_TrueColor", yesterdayUtc(now), "#1d3557"),
    mosaic("VIIRS_Black_Marble", "2016-01-01", "#02030a"),
  ]).then(([d, n]) => {
    if (disposed) return;
    if (d) { mat.uniforms.dayMap.value = texture(d); owned.push(mat.uniforms.dayMap.value); }
    if (n) { mat.uniforms.nightMap.value = texture(n); owned.push(mat.uniforms.nightMap.value); }
    if (!d && !n) console.warn("[globe] GIBS unreachable, staying on procedural globe");
  });

  return {
    group, atmosphere: atm,
    /** City-light mosaic is ~8 km/texel: dim it when the camera is close so it does not smear. */
    setNightGain(g) { mat.uniforms.nightGain.value = g; },
    setSun(v) { mat.uniforms.sunDir.value.set(v.x, v.y, v.z); },
    dispose() {
      disposed = true;
      geo.dispose(); mat.dispose(); atm.geometry.dispose(); atm.material.dispose();
      owned.forEach((t) => t.dispose());
    },
  };
}
