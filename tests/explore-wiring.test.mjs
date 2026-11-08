import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSatIndex, exploreCallbacks } from "../web/explore-wiring.js";

const sats = [
  { noradId: 25544, name: "ISS (ZARYA)", category: "stations" },
  { noradId: 63724, name: "KUIPER-00008", category: "leo" },
  { noradId: 9, name: "SOMESAT" },
];
const fakeRenderer = () => {
  const calls = [];
  return {
    calls,
    simTime: () => new Date("2026-11-08T08:00:00Z"),
    satState: (id) => ({ altKm: id === 25544 ? 420 : 630 }),
    requestNextPass: async (id, obs) => ({ id, obsName: obs.name }),
    identifyAt: (az, el, cone) => [{ noradId: 25544, sepDeg: 1, az, el, cone }],
    setObserver: (obs, horizon) => calls.push(["setObserver", obs.name, horizon]),
    setLook: (az, el) => calls.push(["setLook", az, el]),
    highlight: (id) => calls.push(["highlight", id]),
    pickAt: () => 63724,
  };
};

test("satIndex defaults the category to other", () => {
  assert.deepEqual(buildSatIndex(sats).map((s) => s.category), ["stations", "leo", "other"]);
});

test("getSatInfo joins satcat, live state, next pass and the built-near city", async () => {
  const renderer = fakeRenderer();
  const ctx = { renderer, satsById: new Map(sats.map((s) => [s.noradId, s])),
    satcat: { owners: { US: "United States" }, rows: { 63724: ["US", "2025-04-28", "AFETR", "2025-085A"], 25544: ["ISS", "1998-11-20", "TTMTR", "1998-067A"] } } };
  const cb = exploreCallbacks(ctx);
  const leo = await cb.getSatInfo(63724);
  assert.equal(leo.ownerName, "United States");
  assert.equal(leo.builtNearUwb, "Kirkland");
  assert.equal(leo.state.altKm, 630);
  assert.equal(leo.nextPass.obsName, "UW Bothell");
  const iss = await cb.getSatInfo(25544);
  assert.equal(iss.ownerName, "ISS", "unknown owner codes pass through raw");
  assert.equal(iss.builtNearUwb, null);
  assert.equal(await cb.getSatInfo(123), null);
});

test("location: elsewhere gets a flat horizon, null returns to UWB with its terrain", async () => {
  const renderer = fakeRenderer();
  const labels = [];
  const ctx = { renderer, horizon: { tag: "uwb" }, satsById: new Map(), ui: { setObserverLabel: (t) => labels.push(t) } };
  const cb = exploreCallbacks(ctx);
  cb.onLocation({ name: "Your location", latDeg: 51.5, lonDeg: -0.13, heightKm: 0 });
  cb.onLocation(null);
  assert.deepEqual(renderer.calls.filter((c) => c[0] === "setObserver"), [["setObserver", "Your location", null], ["setObserver", "UW Bothell", { tag: "uwb" }]]);
  assert.deepEqual(labels, ["over your location", "over UW Bothell"]);
});

test("identify uses the last look direction; canvas pick highlights and opens the card", () => {
  const renderer = fakeRenderer();
  const opened = [];
  const ctx = { renderer, satsById: new Map(), ui: { showCard: (id) => opened.push(id) } };
  const cb = exploreCallbacks(ctx);
  cb.onLook(210, 40, null);
  const hit = cb.onIdentify();
  assert.equal(hit[0].az, 210);
  assert.equal(hit[0].el, 40);
  assert.equal(hit[0].cone, 5);
  cb.onCanvasClick({ clientX: 10, clientY: 10 });
  assert.deepEqual(opened, [63724]);
  assert.ok(renderer.calls.some((c) => c[0] === "highlight" && c[1] === 63724));
});

test("everything degrades without a renderer", async () => {
  const cb = exploreCallbacks({ renderer: null, satsById: new Map(sats.map((s) => [s.noradId, s])) });
  assert.deepEqual(cb.onIdentify(), []);
  const info = await cb.getSatInfo(25544);
  assert.equal(info.state, null);
  assert.equal(info.nextPass, undefined);
  cb.onLocation(null);
  cb.onCanvasClick({ clientX: 0, clientY: 0 });
});

test("a drag is not a tap; a still click picks; Tonight pins the observer to UWB", () => {
  const renderer = fakeRenderer();
  const opened = [];
  const ctx = { renderer, horizon: { tag: "uwb" }, satsById: new Map(), ui: { showCard: (id) => opened.push(id), setObserverLabel() {} } };
  const cb = exploreCallbacks(ctx);
  cb.onPointerDown({ clientX: 100, clientY: 100 });
  cb.onCanvasClick({ clientX: 160, clientY: 120 });
  assert.deepEqual(opened, [], "a 60 px drag must not open a card");
  cb.onPointerDown({ clientX: 100, clientY: 100 });
  cb.onCanvasClick({ clientX: 102, clientY: 101 });
  assert.deepEqual(opened, [63724]);
  cb.onSkyTap(5, 5);
  assert.deepEqual(opened, [63724, 63724]);
  cb.onLocation({ name: "Your location", latDeg: 51.5, lonDeg: -0.13, heightKm: 0 });
  cb.onModeChange("tonight");
  cb.onModeChange("lookup");
  const obs = renderer.calls.filter((c) => c[0] === "setObserver").map((c) => c[1]);
  assert.deepEqual(obs.slice(-2), ["UW Bothell", "Your location"]);
});
