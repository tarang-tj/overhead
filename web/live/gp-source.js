// Live orbit data for every Amazon Leo and Starlink satellite, with a
// fallback chain: CelesTrak GP (browser Cache API, 2 h TTL) -> the saved
// snapshot shipped with the site (web/data/gp-snapshot.json) -> empty.
// CelesTrak policy (celestrak.org/usage-policy.php, read 2026-11-07): GP data
// updates every 2 h, download once per update, stop on any non-200. A non-200
// starts a 2 h backoff stored in localStorage so a reload does not retry.
// Never throws; expected network failures log console.warn, never error.

export const GROUPS = Object.freeze({ leo: "kuiper", starlink: "starlink" });
const GP_URL = (group) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
const CACHE_NAME = "overhead-gp-v1";
const TTL_MS = 2 * 60 * 60 * 1000;
const BACKOFF_KEY = "overhead.celestrak.backoffUntil";
const SNAPSHOT_URL = "web/data/gp-snapshot.json";

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function inBackoff(storage, now) {
  try {
    return now < Number(storage?.getItem(BACKOFF_KEY) || 0);
  } catch {
    return false;
  }
}

function startBackoff(storage, now) {
  try {
    storage?.setItem(BACKOFF_KEY, String(now + TTL_MS));
  } catch {
    // Storage unavailable: this page load simply stops trying.
  }
}

/** Read a cached GP group if it is younger than the TTL. */
async function readCached(cacheApi, group, now) {
  if (!cacheApi) return null;
  try {
    const cache = await cacheApi.open(CACHE_NAME);
    const hit = await cache.match(GP_URL(group));
    if (!hit) return null;
    const fetchedAt = Number(hit.headers.get("x-fetched-at") || 0);
    if (now - fetchedAt > TTL_MS || fetchedAt > now + 60_000) return null;
    return { omms: await hit.json(), fetchedAt };
  } catch {
    return null;
  }
}

async function writeCached(cacheApi, group, omms, fetchedAt) {
  if (!cacheApi) return;
  try {
    const cache = await cacheApi.open(CACHE_NAME);
    const headers = { "content-type": "application/json", "x-fetched-at": String(fetchedAt) };
    await cache.put(GP_URL(group), new Response(JSON.stringify(omms), { headers }));
  } catch {
    // Quota or private mode: the live data still works for this page load.
  }
}

/** Fetch one group live; throws on non-200 so the caller can back off. */
async function fetchGroup(fetchImpl, group) {
  const res = await fetchImpl(GP_URL(group), { signal: AbortSignal.timeout(20000) });
  if (res.status !== 200) throw new Error(`CelesTrak HTTP ${res.status}`);
  const omms = await res.json();
  if (!Array.isArray(omms)) throw new Error("CelesTrak returned no list");
  return omms;
}

function toRecords(omms, constellation) {
  return omms
    .filter((o) => o && Number.isFinite(Number(o.MEAN_MOTION)))
    .map((omm) => ({ name: omm.OBJECT_NAME, noradId: Number(omm.NORAD_CAT_ID), constellation, omm }));
}

/** Load the saved snapshot (shipped with the site). */
async function loadSnapshot(fetchImpl, snapshotUrl) {
  try {
    const res = await fetchImpl(snapshotUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    const sats = (snap.sats || []).map((s) => ({
      name: s.omm.OBJECT_NAME, noradId: Number(s.omm.NORAD_CAT_ID), constellation: s.c, omm: s.omm,
    }));
    if (sats.length === 0) throw new Error("empty snapshot");
    return { mode: "snapshot", fetchedAt: snap.fetchedAt, sats };
  } catch (err) {
    console.warn(`[gp] snapshot unavailable: ${err?.message || err}`);
    return { mode: "none", fetchedAt: null, sats: [] };
  }
}

/**
 * Resolve satellites: { mode: "live"|"cache"|"snapshot"|"none", fetchedAt, sats }.
 * Options are injectable for tests.
 */
export async function loadGp({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  cacheApi = globalThis.caches,
  storage = safeStorage(),
  now = Date.now(),
  snapshotUrl = SNAPSHOT_URL,
} = {}) {
  // Per group: reuse a fresh cached copy, fetch only what is missing, and cache
  // each group as soon as it arrives (so one failure never wastes the other).
  const entries = Object.entries(GROUPS);
  const got = await Promise.all(entries.map(([, g]) => readCached(cacheApi, g, now)));
  const anyMissing = got.some((x) => !x);
  if (anyMissing && fetchImpl && !inBackoff(storage, now)) {
    try {
      for (let i = 0; i < entries.length; i++) {
        if (got[i]) continue;
        const group = entries[i][1];
        const omms = await fetchGroup(fetchImpl, group);
        await writeCached(cacheApi, group, omms, now);
        got[i] = { omms, fetchedAt: now, live: true };
      }
    } catch (err) {
      startBackoff(storage, now);
      console.warn(`[gp] live CelesTrak fetch failed, using snapshot: ${err?.message || err}`);
    }
  }
  if (got.every(Boolean)) {
    const sats = entries.flatMap(([c], i) => toRecords(got[i].omms, c));
    const mode = got.some((x) => x.live) ? "live" : "cache";
    return { mode, fetchedAt: new Date(Math.min(...got.map((x) => x.fetchedAt))).toISOString(), sats };
  }
  return loadSnapshot(fetchImpl, snapshotUrl);
}
