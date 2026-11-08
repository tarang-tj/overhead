// OVERHEAD renderer (interfaces.md). Scene axes = ECI, 1 unit = 1 km.
// Tonight mode reuses the Look Up scene (the Tonight panel steers it via setLook).
// Time (setTime/setSpeed) and observer (setObserver) drive everything: propagation, sun, globe spin, look geometry.
// Needs the importmap entries: three, three/addons/, satellite.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sunEciUnit, sunElevationDeg, UWB } from "../orbit/sky.js";
import { createPropagator } from "../orbit/propagator.js";
import { gmstRad } from "./frames.js";
import { createSimClock } from "./sim-clock.js";
import { createSweepStats } from "./sweep-stats.js";
import { filterMask } from "./categories.js";
import { createQueries } from "./queries.js";
import { createLitProbe } from "./lit-probe.js";
import { createEarth } from "./globe.js";
import { createMarkers } from "./markers.js";
import { createUwbPatch } from "./patch.js";
import { createSatPoints, createHighlight } from "./sats.js";
import { createStars } from "./stars.js";
import { createTrails } from "./trails.js";
import { createLookup } from "./lookup.js";
import { placeZoomCamera, placeLookCamera, lookGroupMatrix, updateClip, easeToward } from "./camera-rig.js";
import { smoothstep } from "./zoom.js";
import { createZoomDriver } from "./zoom-driver.js";

export async function createOverheadRenderer({ canvas, sats, horizon, line, now = () => new Date() }) {
  const satList = Array.isArray(sats) ? sats : [];
  const profileOf = (h) => (h && Array.isArray(h.horizonElDeg) && h.horizonElDeg.length >= 3 ? h.horizonElDeg : null);
  let obs = UWB, profile = profileOf(horizon);
  if (!profile) console.warn("[renderer] no horizon profile, using a flat 0 degree horizon");
  const sim = createSimClock(now);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatio); renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 3e5);

  const earth = createEarth(sim.now()), markers = createMarkers(), patch = createUwbPatch(UWB.latDeg, UWB.lonDeg), stars = createStars(pixelRatio);
  earth.group.add(markers.group, patch.group);
  const satsObj = createSatPoints({ sats: satList, line, pixelRatio });
  const trails = createTrails({ sats: satList, satsObj });
  const highlightObj = createHighlight(pixelRatio);  const lookup = createLookup();
  lookup.setProfile(profile); lookup.setPeaks(profile && horizon.peaks); lookup.group.matrixAutoUpdate = false;
  scene.add(stars, earth.group, earth.atmosphere, satsObj.points, trails.obj, highlightObj.obj, lookup.group);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 7500, maxDistance: 90000, rotateSpeed: 0.6, enabled: false });

  const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const probe = createLitProbe(renderer, scene, camera);

  let mode = "orbit", look = { az: 0, el: 25, unc: null };
  let lastFrameMs = performance.now();
  const zoom = createZoomDriver(patch.ready, () => { orbitPlaced = true; });
  let highlightIdx = -1, raf = 0, disposed = false, orbitPlaced = false, easing = false, snapN = 0, sweepMs = 0;
  const tmp = new THREE.Vector3();

  const q = createQueries({ sats: satList, satsObj, camera, canvas, getObs: () => obs, getMode: () => mode, simNow: sim.now, getSweepMs: () => sweepMs, getProfile: () => profile });
  const noradIndex = q.noradIndex;
  const propagator = createPropagator({ now: sim.now });
  const census = createSweepStats({ satsObj, trails, getObs: () => obs, getProfile: () => profile });
  const off = propagator.onUpdate((res) => {
    sweepMs = res.timeMs;
    satsObj.push(res, performance.now(), snapN > 0);
    if (snapN > 0) snapN--;
    census.run(res);
    if (mode === "orbit" && highlightIdx >= 0) trails.updateArc(highlightIdx, new Date(res.timeMs));
  });
  /** Sim time jumped or changed speed: resweep now, snap instead of lerping, and size the sweep cadence to the speed. */
  function clockChanged() {
    snapN = 2;
    propagator.setIntervalMs(sim.speed > 1 ? 100 : 1000);
    propagator.tickNow();
  }
  if (satList.length) propagator.start(satList);
  else console.warn("[renderer] no satellites supplied");

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
    if (next === "orbit") trails.updateArc(highlightIdx, sim.now());
    if (next !== "zoom" && zoom.pending) { zoom.finish(); orbitPlaced = false; }
    if (next === "zoom") { zoom.reset(); orbitPlaced = false; }
    if (next === "orbit" && (wasLook || !orbitPlaced)) {
      placeZoomCamera(camera, 1, gmstRad(sim.now())); controls.target.set(0, 0, 0); controls.update(); orbitPlaced = true;
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
    const date = sim.now();
    const gmst = gmstRad(date);
    const sunEl = sunElevationDeg(date);
    const lookSunEl = obs === UWB ? sunEl : sunElevationDeg(date, obs);
    earth.group.rotation.z = gmst;
    earth.setSun(sunEciUnit(date));
    satsObj.update(tMs);
    if (mode === "lookup" || mode === "tonight") trails.updateTails(true);
    else if (mode !== "orbit" || highlightIdx < 0) trails.hide();

    if (mode === "zoom") {
      placeZoomCamera(camera, zoom.step(tMs, lastFrameMs), gmst);
    } else if (mode === "orbit") {
      if (easing && highlightIdx >= 0) {
        satsObj.positionOf(highlightIdx, tmp);
        if (easeToward(camera, tmp, 0.05) < 0.02) easing = false;
      }
      controls.update();
    } else {
      const { basis, origin } = placeLookCamera(camera, look.az, look.el, date, obs);
      lookGroupMatrix(basis, origin, lookup.group.matrix);
      lookup.group.matrixWorldNeedsUpdate = true;
      const sky = lookup.setSky(lookSunEl);
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
      if (zoom.promise) return zoom.promise;
      applyMode("zoom");
      return zoom.play(reduceMotion());
    },
    skipZoom() { if (mode === "zoom") zoom.finish(); },
    setLook(az, el, unc) {
      look = { az: ((az % 360) + 360) % 360, el: Math.min(89, Math.max(-5, el)), unc: Number.isFinite(unc) ? unc : null };
      lookup.setUncertainty(look.az, look.el, look.unc);
    },
    highlight(id) {
      highlightIdx = id != null && noradIndex.has(id) ? noradIndex.get(id) : -1;
      if (mode === "orbit") trails.updateArc(highlightIdx, sim.now());
      highlightObj.obj.visible = highlightIdx >= 0;
      easing = mode === "orbit" && highlightIdx >= 0 && !reduceMotion();
    },
    /** "constellation" (Leo amber, Starlink blue) or "stage" (raising green, descending red, on station dimmed). */
    setColorMode(m) { satsObj.recolor(m === "stage" ? "stage" : "constellation"); },
    stats: () => ({ ...census.get(), ...q.stats(), lastPassMs: propagator.lastPassMs }),
    litFraction: probe.litFraction,
    /** Move the Look Up / Tonight vantage point. horizon = UWB terrain profile or null for a flat 0 deg ring. */
    setObserver(next, h = null) {
      if (!next || !Number.isFinite(next.latDeg) || !Number.isFinite(next.lonDeg)) { console.warn("[renderer] ignoring invalid observer"); return; }
      obs = { name: next.name || "Observer", latDeg: next.latDeg, lonDeg: next.lonDeg, heightKm: Number.isFinite(next.heightKm) ? next.heightKm : 0 };
      profile = profileOf(h);
      lookup.setProfile(profile);
      lookup.setPeaks(profile && h.peaks); // peak labels only exist for the UWB horizon
      if (propagator.latest()) census.run(propagator.latest());
    },
    /** null = live wall clock (speed back to 1). A Date pins sim time there and it advances at the current speed. */
    setTime(d) { sim.setTime(d); clockChanged(); },
    setSpeed(x) { sim.setSpeed(x); clockChanged(); },
    simTime: () => sim.now(),
    /** keys = category keys to show, or null for all. */
    setCategoryFilter(keys) { satsObj.setShown(keys == null ? null : filterMask(keys)); },
    pickAt: q.pickAt,
    identifyAt: q.identifyAt,
    satState: q.satState,
    requestNextPass: (id, o, from) => propagator.requestNextPass(id, o, from ?? sim.now()),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      off();
      propagator.dispose();
      controls.dispose();
      earth.dispose(); patch.dispose(); markers.dispose(); satsObj.dispose(); trails.dispose(); highlightObj.dispose(); lookup.dispose();
      stars.geometry.dispose(); stars.material.dispose(); probe.dispose();
      renderer.dispose();
    },
  };
}
