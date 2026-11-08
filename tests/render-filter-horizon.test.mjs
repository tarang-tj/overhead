import { test } from "node:test";
import assert from "node:assert/strict";
import * as sat from "satellite.js";
import * as THREE from "three";
import { createQueries } from "../web/render/queries.js";
import { createTrails } from "../web/render/trails.js";
import { stateOf } from "../web/render/sat-queries.js";
import { placeLookCamera } from "../web/render/camera-rig.js";
import { categoryIndex } from "../web/render/categories.js";
import { buildSatrecs, sweep } from "../web/orbit/propagator-core.js";
import { sunEciUnit, UWB } from "../web/orbit/sky.js";

const BASE = { OBJECT_NAME: "T", OBJECT_ID: "2026-001A", EPOCH: "2026-11-07T00:00:00.000000", EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: "U", ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100, MEAN_MOTION_DDOT: 0, MEAN_MOTION: 15.2, ECCENTRICITY: 0.0004, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00002, ARG_OF_PERICENTER: 90 };
const D = new Date("2026-11-07T06:30:00Z");
const N = 1500;
const omms = Array.from({ length: N }, (_, i) => ({ ...BASE, NORAD_CAT_ID: 1000 + i, MEAN_ANOMALY: (i * 47.3) % 360, RA_OF_ASC_NODE: (i * 137.5) % 360, INCLINATION: 40 + (i % 7) * 8 }));
const sats = omms.map((omm, i) => ({ noradId: omm.NORAD_CAT_ID, omm, category: i % 2 ? "stations" : "starlink" }));
const positions = new Float32Array(N * 3), flags = new Uint8Array(N);
sweep(sat, buildSatrecs(sat, omms), D, sunEciUnit(D), positions, flags);
const catIdx = Uint8Array.from(sats, categoryIndex);
const states = sats.map((s, i) => ({ i, id: s.noradId, ...stateOf(sat.json2satrec(s.omm), D, UWB) })).filter((s) => s.elDeg > 5);

test("trails honor the category filter", () => {
  const satsObj = { shown: null, categoryIdx: catIdx, flags, positionOf: (i, o) => o.set(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]), velocityOf: (i, o) => o.set(1, 0, 0) };
  const trails = createTrails({ sats, satsObj });
  const visible = states.map((s) => s.i);
  trails.setPicks(visible, flags);
  trails.updateTails(true);
  const all = trails.obj.geometry.drawRange.count;
  satsObj.shown = Uint8Array.from({ length: 9 }, (_, k) => (k === 0 ? 1 : 0)); // stations only
  trails.updateTails(true);
  const stationsOnly = visible.filter((i) => catIdx[i] === 0).length;
  assert.ok(stationsOnly > 0 && stationsOnly < visible.length);
  assert.equal(trails.obj.geometry.drawRange.count, Math.min(stationsOnly, 300) * 16);
  assert.ok(all > trails.obj.geometry.drawRange.count);
  satsObj.shown = new Uint8Array(9);
  trails.updateTails(true);
  assert.equal(trails.obj.visible, false);
});

test("identifyAt and pickAt skip satellites behind the terrain profile", () => {
  const hi = states.filter((s) => s.elDeg > 5 && s.elDeg < 25).sort((a, b) => a.elDeg - b.elDeg)[0];
  assert.ok(hi, "fixture needs a low satellite");
  const wall = new Array(360).fill(hi.elDeg + 5); // ridge just above it
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const camera = new THREE.PerspectiveCamera(65, 800 / 600, 2, 3e5);
  placeLookCamera(camera, hi.azDeg, hi.elDeg, D, UWB);
  const satsObj = { latest: positions, flags, categoryIdx: catIdx, shown: null, positions };
  let profile = null;
  const q = createQueries({ sats, satsObj, camera, canvas, getObs: () => UWB, getMode: () => "lookup", simNow: () => D, getSweepMs: () => D.getTime(), getProfile: () => profile });
  assert.equal(q.pickAt(400, 300), hi.id, "flat horizon: the sat at screen center is picked");
  assert.ok(q.identifyAt(hi.azDeg, hi.elDeg, 0.5).some((r) => r.noradId === hi.id));
  profile = wall;
  assert.notEqual(q.pickAt(400, 300), hi.id);
  assert.ok(!q.identifyAt(hi.azDeg, hi.elDeg, 0.5).some((r) => r.noradId === hi.id));
  satsObj.shown = Uint8Array.from({ length: 9 }, (_, k) => (k === catIdx[hi.i] ? 0 : 1));
  profile = null;
  assert.notEqual(q.pickAt(400, 300), hi.id, "hidden category is not pickable");
});
