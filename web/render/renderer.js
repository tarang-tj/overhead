// OVERHEAD renderer (interfaces.md). Scene axes = ECI, 1 unit = 1 km.
// Tonight mode reuses the Look Up scene (the Tonight panel steers it via setLook).
// Needs the importmap entries: three, three/addons/, satellite.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sunEciUnit, sunElevationDeg, UWB } from "../orbit/sky.js";
import { createPropagator } from "../orbit/propagator.js";
import { gmstRad, countAboveHorizon } from "./frames.js";
import { createEarth } from "./globe.js";
import { createMarkers } from "./markers.js";
import { createUwbPatch } from "./patch.js";
import { createSatPoints, createHighlight } from "./sats.js";
import { createLookup } from "./lookup.js";
import { placeZoomCamera, placeLookCamera, lookGroupMatrix, updateClip } from "./camera-rig.js";
import { ZOOM_SECONDS, smoothstep } from "./zoom.js";

function createStars(pixelRatio) {
  const n = 3500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(th) * 9e4, s * Math.sin(th) * 9e4, z * 9e4], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.3 * pixelRatio, sizeAttenuation: false, transparent: true, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -5;
  return p;
}

export async function createOverheadRenderer({ canvas, sats, horizon, now = () => new Date() }) {
  const satList = Array.isArray(sats) ? sats : [];
  const profile = horizon && Array.isArray(horizon.horizonElDeg) && horizon.horizonElDeg.length >= 3 ? horizon.horizonElDeg : null;
  if (!profile) console.warn("[renderer] no horizon profile, using a flat 0 degree horizon");
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 3e5);
  camera.up.set(0, 0, 1);

  const earth = createEarth(now());
  const markers = createMarkers();
  const patch = createUwbPatch(UWB.latDeg, UWB.lonDeg);
  earth.group.add(markers.group, patch.group);
  const stars = createStars(pixelRatio);
  const satsObj = createSatPoints({ sats: satList, pixelRatio });
  const highlightObj = createHighlight(pixelRatio);
  const lookup = createLookup();
  lookup.setProfile(profile);
  lookup.setPeaks(horizon && horizon.peaks);
  lookup.group.matrixAutoUpdate = false;
  scene.add(stars, earth.group, earth.atmosphere, satsObj.points, highlightObj.obj, lookup.group);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 7500, maxDistance: 90000, rotateSpeed: 0.6, enabled: false });

  const noradIndex = new Map(satList.map((s, i) => [s.noradId, i]));
  const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const probe = new THREE.WebGLRenderTarget(64, 40);

  let mode = "orbit", look = { az: 0, el: 25, unc: null };
  let zoomT = 0, zoomStart = null, zoomWaitFrom = null, zoomElapsed = 0, lastFrameMs = performance.now(), patchReady = false, zoomResolve = null, zoomPromise = null;
  let stat = { propagated: 0, msPerSweep: 0, visibleAboveHorizon: { leo: 0, starlink: 0 } };
  let highlightIdx = -1, raf = 0, disposed = false, orbitPlaced = false;
  const tmp = new THREE.Vector3();

  const propagator = createPropagator({ now });
  const off = propagator.onUpdate((res) => {
    satsObj.push(res, performance.now());
    const c = countAboveHorizon(res.positions, res.flags, satsObj.constellationIdx, new Date(res.timeMs), profile);
    stat = { propagated: res.valid, msPerSweep: res.ms, visibleAboveHorizon: { leo: c[0], starlink: c[1] } };
  });
  patch.ready.then(() => { patchReady = true; });
  if (satList.length) propagator.start(satList);
  else console.warn("[renderer] no satellites supplied");

  function finishZoom() {
    zoomT = 1; zoomStart = null; zoomWaitFrom = null; orbitPlaced = true;
    if (zoomResolve) { zoomResolve(); zoomResolve = null; zoomPromise = null; }
  }

  function applyMode(next) {
    if (!["zoom", "orbit", "lookup", "tonight"].includes(next)) { console.warn(`[renderer] unknown mode ${next}`); return; }
    const wasLook = mode === "lookup" || mode === "tonight";
    mode = next;
    const isLook = next === "lookup" || next === "tonight";
    earth.group.visible = earth.atmosphere.visible = !isLook;
    lookup.group.visible = isLook;
    satsObj.setSize(isLook ? 9 : 2.2, isLook);
    controls.enabled = next === "orbit";
    camera.up.set(0, 0, 1);
    camera.fov = isLook ? 65 : 45;
    if (next !== "zoom" && zoomResolve) { finishZoom(); orbitPlaced = false; }
    if (next === "zoom") { zoomT = 0; orbitPlaced = false; }
    if (next === "orbit" && (wasLook || !orbitPlaced)) {
      placeZoomCamera(camera, 1, gmstRad(now())); controls.target.set(0, 0, 0); controls.update(); orbitPlaced = true;
    }
    camera.updateProjectionMatrix();
  }

  function frame() {
    if (disposed) return;
    const tMs = performance.now();
    raf = requestAnimationFrame(frame);
    const w = canvas.clientWidth | 0, h = canvas.clientHeight | 0;
    if (w && h && (canvas.width !== (w * pixelRatio | 0) || canvas.height !== (h * pixelRatio | 0))) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const date = now();
    const gmst = gmstRad(date);
    const sunEl = sunElevationDeg(date);
    earth.group.rotation.z = gmst;
    earth.setSun(sunEciUnit(date));
    satsObj.update(tMs);

    if (mode === "zoom") {
      // Clock starts on the first frame after the campus imagery settled (or after 4 s).
      if (zoomStart === null && zoomWaitFrom !== null && (patchReady || tMs - zoomWaitFrom > 4000)) {
        zoomStart = tMs; zoomWaitFrom = null; zoomElapsed = 0;
      }
      if (zoomStart !== null) {
        // Cap each step so a stalled frame (tile decode, hidden tab, slow GPU) never skips the shot.
        zoomElapsed += Math.min(tMs - lastFrameMs, 200);
        zoomT = Math.min(1, zoomElapsed / (ZOOM_SECONDS * 1000));
        if (zoomT >= 1) finishZoom();
      }
      placeZoomCamera(camera, zoomT, gmst);
    } else if (mode === "orbit") {
      controls.update();
    } else {
      const { basis, origin } = placeLookCamera(camera, look.az, look.el, date);
      lookGroupMatrix(basis, origin, lookup.group.matrix);
      lookup.group.matrixWorldNeedsUpdate = true;
      const sky = lookup.setSky(sunEl);
      stars.material.opacity = sky.starAlpha * 0.55;
    }
    if (mode === "zoom" || mode === "orbit") stars.material.opacity = 1;
    const alt = updateClip(camera, mode === "lookup" || mode === "tonight");
    patch.setOpacity(1 - smoothstep(300, 1800, alt));
    markers.setAltitude(alt);
    earth.setNightGain(0.45 + 1.15 * smoothstep(300, 4000, alt));
    patch.setLight(0.45 + 0.55 * smoothstep(-6, 14, sunEl));
    if (highlightIdx >= 0) {
      satsObj.positionOf(highlightIdx, tmp);
      highlightObj.obj.geometry.attributes.position.setXYZ(0, tmp.x, tmp.y, tmp.z);
      highlightObj.obj.geometry.attributes.position.needsUpdate = true;
    }
    lastFrameMs = tMs;
    renderer.render(scene, camera);
  }
  applyMode("orbit");
  raf = requestAnimationFrame(frame);

  return {
    setMode: applyMode,
    playZoom() {
      if (zoomPromise) return zoomPromise;
      applyMode("zoom");
      if (reduceMotion()) { zoomT = 1; return Promise.resolve(); }
      zoomPromise = new Promise((res) => { zoomResolve = res; zoomStart = null; zoomWaitFrom = performance.now(); });
      return zoomPromise;
    },
    skipZoom() { if (mode === "zoom") finishZoom(); },
    setLook(az, el, unc) {
      look = { az: ((az % 360) + 360) % 360, el: Math.min(89, Math.max(-5, el)), unc: Number.isFinite(unc) ? unc : null };
      lookup.setUncertainty(look.az, look.el, look.unc);
    },
    highlight(id) {
      highlightIdx = id != null && noradIndex.has(id) ? noradIndex.get(id) : -1;
      highlightObj.obj.visible = highlightIdx >= 0;
    },
    stats: () => ({ ...stat }),
    litFraction() {
      try {
        const buf = new Uint8Array(64 * 40 * 4);
        renderer.setRenderTarget(probe);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(probe, 0, 0, 64, 40, buf);
        renderer.setRenderTarget(null);
        let lit = 0;
        for (let i = 0; i < buf.length; i += 4) if (buf[i] + buf[i + 1] + buf[i + 2] > 6) lit++;
        return lit / (64 * 40);
      } catch (err) {
        renderer.setRenderTarget(null);
        console.warn("[renderer] litFraction failed", err);
        return 0;
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      off();
      propagator.dispose();
      controls.dispose();
      earth.dispose(); patch.dispose(); markers.dispose(); satsObj.dispose(); highlightObj.dispose(); lookup.dispose();
      stars.geometry.dispose(); stars.material.dispose(); probe.dispose();
      renderer.dispose();
    },
  };
}
