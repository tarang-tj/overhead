import { test } from "node:test";
import assert from "node:assert/strict";
import * as sat from "satellite.js";
import { createQueries } from "../web/render/queries.js";
import { stateOf, angularSepDeg } from "../web/render/sat-queries.js";
import { scanSky } from "../web/render/sky-scan.js";
import { categoryIndex } from "../web/render/categories.js";
import { buildSatrecs, sweep } from "../web/orbit/propagator-core.js";
import { lookAngles, sunEciUnit, sunElevationDeg, isSunlit, UWB } from "../web/orbit/sky.js";

const BASE = {
  OBJECT_NAME: "T", OBJECT_ID: "2026-001A", EPOCH: "2026-11-07T00:00:00.000000", EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: "U",
  ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100, MEAN_MOTION_DDOT: 0,
};
const LEO = { ...BASE, NORAD_CAT_ID: 99001, MEAN_MOTION: 15.2, ECCENTRICITY: 0.0004, INCLINATION: 53.05, RA_OF_ASC_NODE: 120.5, ARG_OF_PERICENTER: 90.1, MEAN_ANOMALY: 270.2, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00002 };
const GEO = { ...BASE, NORAD_CAT_ID: 99002, MEAN_MOTION: 1.0027, ECCENTRICITY: 0.0002, INCLINATION: 0.05, RA_OF_ASC_NODE: 80, ARG_OF_PERICENTER: 10, MEAN_ANOMALY: 100, BSTAR: 0, MEAN_MOTION_DOT: 0 };
const D = new Date("2026-11-07T06:30:00Z");
const LONDON = { name: "London", latDeg: 51.5, lonDeg: -0.13, heightKm: 0.02 };

test("satState matches satellite.js; LEO ~7.6 km/s, GEO ~3.07 km/s, altitudes sane", () => {
  for (const [omm, v, alt] of [[LEO, 7.6, [400, 560]], [GEO, 3.07, [35500, 36100]]]) {
    const rec = sat.json2satrec(omm);
    const s = stateOf(rec, D, UWB);
    const pv = sat.propagate(rec, D);
    const gd = sat.eciToGeodetic(pv.position, sat.gstime(D));
    assert.ok(Math.abs(s.latDeg - sat.degreesLat(gd.latitude)) < 1e-9);
    assert.ok(Math.abs(s.lonDeg - sat.degreesLong(gd.longitude)) < 1e-9);
    assert.ok(Math.abs(s.altKm - gd.height) < 1e-9);
    assert.ok(Math.abs(s.speedKmS - Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)) < 1e-12);
    assert.ok(Math.abs(s.speedKmS - v) < 0.1, `speed ${s.speedKmS}`);
    assert.ok(s.altKm > alt[0] && s.altKm < alt[1], `alt ${s.altKm}`);
    assert.equal(s.sunlit, isSunlit(pv.position, sunEciUnit(D)));
    assert.ok(s.lonDeg >= -180 && s.lonDeg <= 180);
  }
});

test("sim time: state at a later time equals satellite.js at that time, and differs from now", () => {
  const rec = sat.json2satrec(LEO);
  const later = new Date(D.getTime() + 6 * 3600e3);
  const a = stateOf(rec, later, UWB), ref = sat.propagate(rec, later).position;
  const la = lookAngles(ref, later, UWB);
  assert.ok(Math.abs(a.azDeg - la.azDeg) < 1e-9 && Math.abs(a.elDeg - la.elDeg) < 1e-9);
  const now = stateOf(rec, D, UWB);
  assert.ok(Math.abs(now.lonDeg - a.lonDeg) > 1 || Math.abs(now.latDeg - a.latDeg) > 1);
});

test("observer change: same satellite, two observers, each az/el equals sky.js lookAngles", () => {
  const rec = sat.json2satrec(LEO);
  const p = sat.propagate(rec, D).position;
  const a = stateOf(rec, D, UWB), b = stateOf(rec, D, LONDON);
  for (const [s, obs] of [[a, UWB], [b, LONDON]]) {
    const ref = lookAngles(p, D, obs);
    assert.ok(Math.abs(s.azDeg - ref.azDeg) < 1e-9 && Math.abs(s.elDeg - ref.elDeg) < 1e-9);
  }
  assert.ok(Math.abs(a.azDeg - b.azDeg) > 0.5 || Math.abs(a.elDeg - b.elDeg) > 0.5, "observers see it differently");
  assert.equal(a.latDeg, b.latDeg); // where it is does not depend on who is looking
});

test("stateOf returns null for a failed propagation", () => {
  assert.equal(stateOf({}, D, UWB), null);
});

test("angularSepDeg: known angles", () => {
  assert.ok(Math.abs(angularSepDeg(0, 0, 90, 0) - 90) < 1e-9);
  assert.ok(Math.abs(angularSepDeg(10, 90, 200, 90)) < 1e-6); // both at zenith
  assert.ok(Math.abs(angularSepDeg(350, 0, 10, 0) - 20) < 1e-9);
  assert.equal(angularSepDeg(5, 5, 5, 5), 0);
});

function fixture(extra = 60) {
  const omms = Array.from({ length: extra }, (_, i) => ({ ...LEO, NORAD_CAT_ID: 1000 + i, MEAN_ANOMALY: (i * 47.3) % 360, RA_OF_ASC_NODE: (i * 137.5) % 360, INCLINATION: 40 + (i % 7) * 8 }));
  const sats = omms.map((omm) => ({ noradId: omm.NORAD_CAT_ID, omm, category: "other" }));
  const recs = buildSatrecs(sat, omms);
  const positions = new Float32Array(extra * 3), flags = new Uint8Array(extra);
  sweep(sat, recs, D, sunEciUnit(D), positions, flags);
  return { sats, recs, positions, flags };
}

test("identifyAt: cone filter and nearest-first order match a brute-force search", () => {
  const { sats, positions, flags } = fixture(1500);
  const satsObj = { latest: positions, flags, categoryIdx: Uint8Array.from(sats, categoryIndex) };
  const q = createQueries({ sats, satsObj, camera: null, canvas: null, getObs: () => UWB, getMode: () => "lookup", simNow: () => D, getSweepMs: () => D.getTime() });
  // aim at the highest satellite so the cone has at least that one in it
  const all = sats.map((s, i) => ({ id: s.noradId, ...stateOf(sat.json2satrec(s.omm), D, UWB) })).filter((s) => s.elDeg >= 0);
  assert.ok(all.length > 3, "fixture needs several sats above the horizon");
  all.sort((x, y) => y.elDeg - x.elDeg);
  const target = all[0];
  for (const cone of [1, 5, 25, 90]) {
    const got = q.identifyAt(target.azDeg, target.elDeg, cone);
    const want = all.map((s) => ({ id: s.id, sep: angularSepDeg(target.azDeg, target.elDeg, s.azDeg, s.elDeg) })).filter((s) => s.sep <= cone).sort((a, b) => a.sep - b.sep);
    assert.deepEqual(got.map((r) => r.noradId), want.map((r) => r.id), `cone ${cone}`);
    for (let i = 1; i < got.length; i++) assert.ok(got[i].sepDeg >= got[i - 1].sepDeg);
    for (const r of got) assert.ok(r.sepDeg <= cone && typeof r.sunlit === "boolean" && r.elDeg >= 0 && r.azDeg >= 0 && r.azDeg < 360);
  }
  const first = q.identifyAt(target.azDeg, target.elDeg, 5)[0];
  assert.equal(first.noradId, target.id);
  assert.ok(first.sepDeg < 1e-6);
  assert.deepEqual(q.identifyAt(target.azDeg, target.elDeg, 0.0001).map((r) => r.noradId), [target.id]);
  assert.deepEqual(q.identifyAt(NaN, 10), []);
});

test("identifyAt copes with a sweep that lags the sim clock", () => {
  const { sats, positions, flags } = fixture(1500);
  const satsObj = { latest: positions, flags, categoryIdx: Uint8Array.from(sats, categoryIndex) };
  const later = new Date(D.getTime() + 1500); // sim clock 1.5 s ahead of the sweep
  const q = createQueries({ sats, satsObj, camera: null, canvas: null, getObs: () => UWB, getMode: () => "lookup", simNow: () => later, getSweepMs: () => D.getTime() });
  const best = sats.map((s) => ({ id: s.noradId, ...stateOf(sat.json2satrec(s.omm), later, UWB) })).filter((s) => s.elDeg > 5).sort((x, y) => y.elDeg - x.elDeg)[0];
  assert.equal(q.identifyAt(best.azDeg, best.elDeg, 2)[0].noradId, best.id);
});

test("satState via createQueries uses sim time and observer, null for unknown ids", () => {
  const { sats, positions, flags } = fixture(5);
  let t = D, obs = UWB;
  const q = createQueries({ sats, satsObj: { latest: positions, flags }, camera: null, canvas: null, getObs: () => obs, getMode: () => "orbit", simNow: () => t, getSweepMs: () => 0 });
  const s1 = q.satState(1000);
  assert.deepEqual(s1, stateOf(sat.json2satrec(sats[0].omm), D, UWB));
  t = new Date(D.getTime() + 3600e3); obs = LONDON;
  assert.deepEqual(q.satState("1000"), stateOf(sat.json2satrec(sats[0].omm), t, LONDON));
  assert.equal(q.satState(424242), null);
});

test("scanSky: counts by category, flat vs terrain horizon, seeableNow needs dark sky + sunlit + el >= 10", () => {
  const { sats, positions, flags } = fixture(1500);
  const cat = Uint8Array.from(sats, (s, i) => (i % 2 ? categoryIndex({ category: "weather" }) : categoryIndex({ category: "other" })));
  // pick a date/observer where the sky is dark: UWB at 06:30Z (22:30 local)
  const sunEl = sunElevationDeg(D, UWB);
  assert.ok(sunEl < -6, `fixture sun ${sunEl}`);
  const flat = scanSky({ positions, flags, catIdx: cat, date: D, obs: UWB, profile: null, sunElDeg: sunEl });
  const total = Object.values(flat.byCategory).reduce((a, b) => a + b, 0);
  assert.equal(flat.byCategory.weather + flat.byCategory.other, total);
  // brute force
  let above = 0, seen = 0;
  const vis = [];
  for (let i = 0; i < 1500; i++) {
    if (flags[i] === 2) continue;
    const la = lookAngles({ x: positions[3 * i], y: positions[3 * i + 1], z: positions[3 * i + 2] }, D, UWB);
    if (la.elDeg >= 0) { above++; vis.push(i); if (flags[i] === 0 && la.elDeg >= 10) seen++; }
  }
  assert.ok(above > 3);
  assert.ok(Math.abs(total - above) <= 1, `${total} vs ${above}`); // spherical vs WGS84 elevation can differ at exactly 0 deg
  assert.ok(Math.abs(flat.seeable - seen) <= 1, `${flat.seeable} vs ${seen}`);
  const mountains = new Array(360).fill(30);
  const hilly = scanSky({ positions, flags, catIdx: cat, date: D, obs: UWB, profile: mountains, sunElDeg: sunEl });
  assert.ok(Object.values(hilly.byCategory).reduce((a, b) => a + b, 0) < total, "a 30 deg wall hides low satellites");
  const day = scanSky({ positions, flags, catIdx: cat, date: D, obs: UWB, profile: null, sunElDeg: 20 });
  assert.equal(day.seeable, 0);
  const london = scanSky({ positions, flags, catIdx: cat, date: D, obs: LONDON, profile: null, sunElDeg: sunEl });
  assert.notDeepEqual(london.byCategory, flat.byCategory, "moving the observer changes the census");
});
