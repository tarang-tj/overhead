// Live orbit data for every active satellite (CelesTrak GROUP=active), with a
// fallback chain: CelesTrak GP (browser Cache API, 2 h TTL) -> the saved
// snapshot shipped with the site (web/data/gp-snapshot.json) -> empty.
// CelesTrak policy (celestrak.org/usage-policy.php, read 2026-11-07): GP data
// updates every 2 h, download once per update, stop on any non-200. A non-200
// starts a 2 h backoff stored in localStorage so a reload does not retry.
// Never throws; expected network failures log console.warn, never error.

export const GROUPS = Object.freeze({ active: "active" });
const GP_URL = (group) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
const CACHE_NAME = "overhead-gp-v2";
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

// HTTP refusals (non-200) back off for the full 2 h, as CelesTrak asks. Network
// failures (offline, timeout) are not refusals: retry after 10 minutes.
const NETWORK_BACKOFF_MS = 10 * 60 * 1000;
function startBackoff(storage, now, ms = TTL_MS) {
  try {
    storage?.setItem(BACKOFF_KEY, String(now + ms));
  } catch {
    // Storage unavailable: this page load simply stops trying.
  }
}

/** Read a cached GP group; `stale` marks one older than the TTL (usable only as a fallback). */
async function readCached(cacheApi, group, now) {
  if (!cacheApi) return null;
  try {
    const cache = await cacheApi.open(CACHE_NAME);
    const hit = await cache.match(GP_URL(group));
    if (!hit) return null;
    const fetchedAt = Number(hit.headers.get("x-fetched-at") || 0);
    if (fetchedAt > now + 60_000) return null;
    return { omms: await hit.json(), fetchedAt, stale: now - fetchedAt > TTL_MS };
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
  // 60 s covers a multi-MB body on a slow phone; AbortSignal.timeout is missing before iOS 16.
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(60000) : undefined;
  const res = await fetchImpl(GP_URL(group), { signal });
  if (res.status !== 200) throw Object.assign(new Error(`CelesTrak HTTP ${res.status}`), { http: true });
  const omms = await res.json();
  if (!Array.isArray(omms)) throw new Error("CelesTrak returned no list");
  return omms;
}

/** noradId -> category key, from web/data/categories.json (byCategory lists). */
export function categoryIndex(categories) {
  const idx = new Map();
  for (const [key, ids] of Object.entries(categories?.byCategory || {})) {
    for (const id of ids) if (!idx.has(Number(id))) idx.set(Number(id), key);
  }
  return idx;
}

const CONSTELLATIONS = new Set(["leo", "starlink"]);
function tag(rec, category) {
  return { ...rec, category, constellation: CONSTELLATIONS.has(category) ? category : null };
}

function toRecords(omms, catOf) {
  return omms
    .filter((o) => o && Number.isFinite(Number(o.MEAN_MOTION)))
    .map((omm) => {
      const noradId = Number(omm.NORAD_CAT_ID);
      return tag({ name: omm.OBJECT_NAME, noradId, omm }, catOf(noradId, omm));
    });
}

/** Load the saved snapshot (shipped with the site). */
async function loadSnapshot(fetchImpl, snapshotUrl, catOf) {
  try {
    const res = await fetchImpl(snapshotUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    const sats = (snap.sats || []).map((s) =>
      tag({ name: s.omm.OBJECT_NAME, noradId: Number(s.omm.NORAD_CAT_ID), omm: s.omm },
        s.c || catOf(Number(s.omm.NORAD_CAT_ID), s.omm)));
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
  categories = null,
} = {}) {
  // Category: categories.json first; name-based fallback keeps Leo/Starlink right without it.
  const idx = categoryIndex(categories);
  const catOf = (id, omm) => idx.get(id)
    || (/^KUIPER|^AMAZON LEO/i.test(omm.OBJECT_NAME || "") ? "leo" : /^STARLINK/i.test(omm.OBJECT_NAME || "") ? "starlink" : "other");
  // The v1 cache held two groups (~5 MB); drop it once.
  cacheApi?.delete?.("overhead-gp-v1").catch?.(() => {});
  // Per group: reuse a fresh cached copy, fetch only what is missing, and cache
  // each group as soon as it arrives.
  const entries = Object.entries(GROUPS);
  const cached = await Promise.all(entries.map(([, g]) => readCached(cacheApi, g, now)));
  const got = cached.map((c) => (c && !c.stale ? c : null));
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
      startBackoff(storage, now, err?.http ? TTL_MS : NETWORK_BACKOFF_MS);
      console.warn(`[gp] live CelesTrak fetch failed, using saved data: ${err?.message || err}`);
    }
  }
  const asResult = (list, mode) => ({
    mode, fetchedAt: new Date(Math.min(...list.map((x) => x.fetchedAt))).toISOString(),
    sats: entries.flatMap((_, i) => toRecords(list[i].omms, catOf)),
  });
  if (got.every(Boolean)) return asResult(got, got.some((x) => x.live) ? "live" : "cache");
  // Live failed: use whichever saved copy is newer, an expired browser cache or the snapshot.
  const snap = await loadSnapshot(fetchImpl, snapshotUrl, catOf);
  if (cached.every(Boolean)) {
    const cacheAt = Math.min(...cached.map((x) => x.fetchedAt));
    if (!snap.fetchedAt || cacheAt > Date.parse(snap.fetchedAt)) return asResult(cached, "cache");
  }
  return snap;
}
