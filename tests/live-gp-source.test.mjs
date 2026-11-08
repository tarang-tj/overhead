import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGp } from "../web/live/gp-source.js";

const omm = (id, name) => ({ OBJECT_NAME: name, NORAD_CAT_ID: id, MEAN_MOTION: 14.8 });
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

test("live: the active group is fetched once and tagged by category", async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return json([omm(1, "KUIPER-1"), omm(2, "STARLINK-2"), omm(25544, "ISS (ZARYA)"), omm(9, "SOMESAT")]); };
  const categories = { byCategory: { stations: [25544] } };
  const r = await loadGp({ fetchImpl, cacheApi: null, storage: memStorage(), now: 1e12, categories });
  assert.equal(r.mode, "live");
  assert.equal(urls.length, 1);
  assert.match(urls[0], /GROUP=active/);
  assert.deepEqual(r.sats.map((s) => [s.noradId, s.category, s.constellation]),
    [[1, "leo", "leo"], [2, "starlink", "starlink"], [25544, "stations", null], [9, "other", null]]);
});

test("non-200 from CelesTrak: back off and fall back to the snapshot; no retry inside the backoff", async () => {
  const calls = [];
  const storage = memStorage();
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("celestrak")) return json(null, 403);
    return json({ fetchedAt: "2026-11-07T00:00:00Z", sats: [{ c: "leo", omm: omm(3, "KUIPER-3") }] });
  };
  const r1 = await loadGp({ fetchImpl, cacheApi: null, storage, now: 1e12 });
  assert.equal(r1.mode, "snapshot");
  assert.equal(r1.sats[0].noradId, 3);
  const before = calls.filter((u) => u.includes("celestrak")).length;
  await loadGp({ fetchImpl, cacheApi: null, storage, now: 1e12 + 60_000 });
  assert.equal(calls.filter((u) => u.includes("celestrak")).length, before, "must not query CelesTrak during backoff");
});

test("everything down: mode none, empty list, no throw", async () => {
  const r = await loadGp({ fetchImpl: async () => { throw new Error("offline"); }, cacheApi: null, storage: memStorage(), now: 1e12 });
  assert.equal(r.mode, "none");
  assert.equal(r.sats.length, 0);
});

test("browser cache: a reload inside 2 h makes no new request", async () => {
  const store = new Map();
  const cacheApi = { open: async () => ({
    match: async (u) => store.get(u)?.clone() ?? null,
    put: async (u, r) => { store.set(u, r); },
  }) };
  const now = 1e12;
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return json([omm(1, "KUIPER-1"), omm(2, "STARLINK-2")]); };
  const first = await loadGp({ fetchImpl, cacheApi, storage: memStorage(), now });
  assert.equal(first.mode, "live");
  assert.equal(calls.length, 1);
  // Within the 2 h window a reload is served from the cache with no new request.
  const second = await loadGp({ fetchImpl, cacheApi, storage: memStorage(), now: now + 1000 });
  assert.equal(second.mode, "cache");
  assert.equal(calls.length, 1);
  assert.equal(second.sats.length, 2);
});

test("network failure backs off 10 min (not 2 h); an expired cache newer than the snapshot is used", async () => {
  const store = new Map();
  const cacheApi = { open: async () => ({ match: async (u) => store.get(u)?.clone() ?? null, put: async (u, r) => { store.set(u, r); } }), delete: async () => true };
  const storage = memStorage();
  const t0 = Date.parse("2026-11-08T00:00:00Z");
  await loadGp({ fetchImpl: async (u) => (u.includes("celestrak") ? json([omm(1, "KUIPER-1")]) : json(null, 404)), cacheApi, storage, now: t0 });
  const later = t0 + 3 * 3600e3; // cache expired
  const fetchImpl = async (u) => {
    if (u.includes("celestrak")) throw new Error("offline");
    return json({ fetchedAt: "2026-11-07T00:00:00Z", sats: [{ omm: omm(2, "STARLINK-2") }] });
  };
  const r = await loadGp({ fetchImpl, cacheApi, storage, now: later });
  assert.equal(r.mode, "cache", "the expired cache (Nov 8) beats the older snapshot (Nov 7)");
  assert.equal(r.sats[0].noradId, 1);
  const until = Number(storage.getItem("overhead.celestrak.backoffUntil"));
  assert.equal(until - later, 10 * 60 * 1000);
});
