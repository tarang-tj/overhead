// Camera placement for each mode. Scene axes are ECI, 1 unit = 1 km.
import * as THREE from "three";
import { R_KM, geoToEcef, rotZ, enuBasisEci, lookDirEci, observerEci } from "./frames.js";
import { zoomPose } from "./zoom.js";
import { UWB } from "../orbit/sky.js";

/** Zoom-shot pose at t in [0,1]; sets camera position/orientation, returns altitude km. */
export function placeZoomCamera(camera, t, gmst) {
  const pose = zoomPose(t, R_KM);
  const d = geoToEcef(UWB.latDeg, UWB.lonDeg, 0);
  const dn = { x: d.x / R_KM, y: d.y / R_KM, z: d.z / R_KM };
  // local north in ECEF, used to slide the camera south for the oblique start
  const la = (UWB.latDeg * Math.PI) / 180, lo = (UWB.lonDeg * Math.PI) / 180;
  const north = { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) };
  const r = R_KM + pose.altKm;
  const pos = rotZ({
    x: dn.x * r - north.x * pose.offsetKm, y: dn.y * r - north.y * pose.offsetKm, z: dn.z * r - north.z * pose.offsetKm,
  }, gmst);
  const ground = rotZ(d, gmst);
  camera.up.set(0, 0, 1);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(ground.x * (1 - pose.aim), ground.y * (1 - pose.aim), ground.z * (1 - pose.aim));
  return pose.altKm;
}

/** Observer-at-UWB camera looking (az, el). Returns the ENU basis + observer ECI for the lookup group. */
export function placeLookCamera(camera, azDeg, elDeg, date) {
  const basis = enuBasisEci(UWB.latDeg, UWB.lonDeg, date);
  const o = observerEci(UWB.latDeg, UWB.lonDeg, UWB.heightKm, date);
  const dir = lookDirEci(basis, azDeg, elDeg);
  camera.up.set(basis.up.x, basis.up.y, basis.up.z);
  camera.position.set(o.x, o.y, o.z);
  camera.lookAt(o.x + dir.x, o.y + dir.y, o.z + dir.z);
  return { basis, origin: o };
}

export function lookGroupMatrix(basis, origin, out = new THREE.Matrix4()) {
  out.makeBasis(new THREE.Vector3(basis.east.x, basis.east.y, basis.east.z),
    new THREE.Vector3(basis.north.x, basis.north.y, basis.north.z),
    new THREE.Vector3(basis.up.x, basis.up.y, basis.up.z));
  out.setPosition(origin.x, origin.y, origin.z);
  return out;
}

/** Near plane scales with altitude so the 1 km opener and the orbit view both keep depth precision. */
export function updateClip(camera, lookup) {
  const alt = camera.position.length() - R_KM;
  camera.near = lookup ? 2 : Math.max(0.01, alt * 0.05);
  camera.far = 3e5;
  camera.updateProjectionMatrix();
  return alt;
}
