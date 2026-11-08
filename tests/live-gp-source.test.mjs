import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGp } from "../web/live/gp-source.js";

const omm = (id, name) => ({ OBJECT_NAME: name, NORAD_CAT_ID: id, MEAN_MOTION: 14.8 });
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

test("live: both groups fetched and tagged by constellation", async () => {
  const fetchImpl = async (url) => json(url.includes("kuiper") ? [omm(1, "KUIPER-1")] : [omm(2, "STARLINK-2")]);
  const r = await loadGp({ fetchImpl, cacheApi: null, storage: memStorage(), now: 1e12 });
  assert.equal(r.mode, "live");
  assert.deepEqual(r.sats.map((s) => [s.constellation, s.noradId]), [["leo", 1], ["starlink", 2]]);
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

test("per-group cache: a cached group is reused and only the missing group is fetched", async () => {
  const store = new Map();
  const cacheApi = { open: async () => ({
    match: async (u) => store.get(u)?.clone() ?? null,
    put: async (u, r) => { store.set(u, r); },
  }) };
  const now = 1e12;
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return json(url.includes("kuiper") ? [omm(1, "KUIPER-1")] : [omm(2, "STARLINK-2")]); };
  const first = await loadGp({ fetchImpl, cacheApi, storage: memStorage(), now });
  assert.equal(first.mode, "live");
  assert.equal(calls.length, 2);
  // Evict only Starlink: the next load must fetch Starlink alone.
  for (const k of [...store.keys()]) if (k.includes("starlink")) store.delete(k);
  const second = await loadGp({ fetchImpl, cacheApi, storage: memStorage(), now: now + 1000 });
  assert.equal(calls.length, 3);
  assert.ok(calls[2].includes("starlink"));
  assert.equal(second.sats.length, 2);
});
