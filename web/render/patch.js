// Real aerial imagery around UW Bothell for the zoom opener: USGS National
// Map imagery (public domain, CORS open, checked 2026-11-07). Three nested
// Web-Mercator tile grids, each a flat quad whose corners sit on the sphere,
// living in the Earth (ECEF) group. Procedural dark grid when tiles fail.
import * as THREE from "three";
import { geoToEcef } from "./frames.js";
import { loadTileImage, makeCanvas } from "./tiles.js";

const URL = (z, y, x) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`;
// Nested grids (widths at UWB: ~79, 20, 3.3, 1.6 km). No z9 layer: USGS imagery is US-only and a
// 315 km grid reaches into Canada, where the service returns white no-data tiles. Each finer layer is feathered
// into the coarser one so the globe's blurry mosaic never shows from 1 km to 300 km up.
const LAYERS = [
  { z: 11, n: 6, lift: 0.003 }, { z: 13, n: 6, lift: 0.005 },
  { z: 15, n: 4, lift: 0.007 }, { z: 16, n: 4, lift: 0.009 },
];

/** 64x64 alpha mask: opaque in the middle, soft 12% edge on all sides (alphaMap reads green). */
function featherMask() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(64, 64);
  const edge = (v) => Math.min(1, Math.min(v, 63 - v) / 8);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = Math.round(255 * Math.min(edge(x), edge(y)));
    img.data.set([a, a, a, 255], (y * 64 + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export function tileXY(latDeg, lonDeg, z) {
  const n = 2 ** z, la = (latDeg * Math.PI) / 180;
  return {
    x: Math.floor(((lonDeg + 180) / 360) * n),
    y: Math.floor(((1 - Math.asinh(Math.tan(la)) / Math.PI) / 2) * n),
  };
}
const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

function fallbackCanvas(px, opaque) {
  const c = makeCanvas(px, px, opaque ? "#0b100e" : "rgba(0,0,0,0)");
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgba(120,140,150,0.35)";
  for (let i = 0; i <= px; i += px / 8) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, px); ctx.moveTo(0, i); ctx.lineTo(px, i); ctx.stroke();
  }
  return c;
}

const SEG = 12;

/** Grid of SEG x SEG cells with every vertex on the sphere, so wide layers follow Earth's curve. */
function quad(z, x0, y0, n, lift) {
  const pos = new Float32Array((SEG + 1) ** 2 * 3), uv = new Float32Array((SEG + 1) ** 2 * 2), idx = [];
  for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
    const k = j * (SEG + 1) + i;
    const p = geoToEcef(tileLat(y0 + (n * j) / SEG, z), tileLon(x0 + (n * i) / SEG, z), lift);
    pos.set([p.x, p.y, p.z], k * 3);
    uv.set([i / SEG, 1 - j / SEG], k * 2);
    if (i < SEG && j < SEG) idx.push(k, k + SEG + 1, k + 1, k + 1, k + SEG + 1, k + SEG + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Returns { group, setLight(0..1), setOpacity(0..1), dispose() }. Tiles stream in; never rejects. */
export function createUwbPatch(latDeg, lonDeg) {
  const group = new THREE.Group();
  const parts = [];
  const mask = featherMask();
  const settled = [];
  let light = 0.6, opacity = 1;
  const apply = () => parts.forEach((p) => {
    p.mat.color.setRGB(light, light, light * 1.08);
    p.mat.opacity = opacity;
  });
  LAYERS.forEach((L, i) => {
    const c = tileXY(latDeg, lonDeg, L.z);
    const x0 = c.x - L.n / 2 + 1, y0 = c.y - L.n / 2 + 1;
    const px = L.n * 256;
    const canvas = fallbackCanvas(px, i === 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const geo = quad(L.z, x0, y0, L.n, L.lift);
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: mask, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1 + i;
    group.add(mesh);
    parts.push({ mat, geo, tex });
    const ctx = canvas.getContext("2d");
    let ok = 0;
    const jobs = [];
    for (let dy = 0; dy < L.n; dy++) for (let dx = 0; dx < L.n; dx++) {
      jobs.push(loadTileImage(URL(L.z, y0 + dy, x0 + dx)).then((img) => {
        if (img) { ctx.drawImage(img, dx * 256, dy * 256, 256, 256); ok++; }
      }));
    }
    const done = Promise.allSettled(jobs);
    settled.push(done);
    done.then(() => {
      if (ok > 0) tex.needsUpdate = true;
      else console.warn(`[patch] USGS z${L.z} unreachable, procedural fill`);
    });
  });
  apply();
  return {
    group,
    /** Resolves when every layer's tiles have settled (loaded or failed). */
    ready: Promise.all(settled).then(() => true),
    setLight(v) { light = v; apply(); },
    setOpacity(v) { opacity = v; group.visible = v > 0.01; apply(); },
    dispose() { parts.forEach((p) => { p.geo.dispose(); p.mat.dispose(); p.tex.dispose(); }); mask.dispose(); },
  };
}
