// Site markers: a dot plus a text label, both screen-space sprites so they stay
// readable from 1 km up to orbit. Lives in the Earth (ECEF) group.
import * as THREE from "three";
import { geoToEcef } from "./frames.js";

export const SITES = [
  // anchor = sprite.center for the label: UWB sits above its dot, Kirkland
  // (west) reads leftward and Redmond (east) rightward, both below, so the
  // three never stack on top of each other while the camera climbs.
  { id: "uwb", label: "UW Bothell", lat: 47.7603126, lon: -122.1915305, color: "#ffffff", anchor: [0, -0.7], align: "left" },
  { id: "kirkland", label: "Amazon Leo factory, Kirkland", lat: 47.6765382, lon: -122.2070775, color: "#ffb04a", anchor: [1, 1.7], align: "right" },
  { id: "redmond", label: "Starlink factory, Redmond", lat: 47.6694141, lon: -122.1238767, color: "#a8ccff", anchor: [0, 1.7], align: "left" },
];

export function labelTexture(text, color, align = "left") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, align === "right" ? 504 : 8, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.stroke();
  return new THREE.CanvasTexture(c);
}

export function createMarkers() {
  const group = new THREE.Group();
  const disposables = [];
  const factoryLabels = [];
  for (const s of SITES) {
    const p = geoToEcef(s.lat, s.lon, 0.02);
    const dotTex = dotTexture(s.color), labTex = labelTexture(s.label, s.color, s.align);
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, depthTest: false, transparent: true, sizeAttenuation: false }));
    dot.scale.set(0.022, 0.022, 1);
    dot.position.set(p.x, p.y, p.z);
    dot.renderOrder = 30;
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labTex, depthTest: false, transparent: true, sizeAttenuation: false }));
    lab.center.set(s.anchor[0], s.anchor[1]);
    lab.scale.set(0.3, 0.0375, 1);
    lab.position.set(p.x, p.y, p.z);
    lab.renderOrder = 30;
    group.add(dot, lab);
    if (s.id !== "uwb") factoryLabels.push(lab);
    disposables.push(dotTex, labTex, dot.material, lab.material);
  }
  /** The two factories are ~6 km apart: labels are anchored apart (left/right, below UWB) and hide past 1500 km where they would crowd. */
  const setAltitude = (altKm) => factoryLabels.forEach((l) => { l.visible = altKm < 1500; });
  return { group, setAltitude, dispose() { disposables.forEach((d) => d.dispose()); } };
}
