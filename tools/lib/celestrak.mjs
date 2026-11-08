// CelesTrak fetch helper. Policy (celestrak.org/usage-policy.php): download
// once per update (GP refreshes about every 2 h) and stop on any non-200.
// Raw responses are cached on disk for 2 h so reruns never re-download.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_GAP_MS = 1000;
let lastNetworkAt = 0;
/** fetch with a 1 s minimum gap between CelesTrak network calls (cache hits never reach it). */
export async function politeFetch(url, init) {
  const wait = lastNetworkAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNetworkAt = Date.now();
  return globalThis.fetch(url, init);
}

export const TTL_MS = 2 * 3600 * 1000;
export const USER_AGENT = "overhead-pipeline/0.1 (+https://github.com/tarang-tj)";
const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(HERE, "..", "cache");

export const gpUrl = (group) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
export const satcatActiveUrl = "https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=json";
export const satcatCsvUrl = "https://celestrak.org/pub/satcat.csv";
export const satcatUrl = (name) => `https://celestrak.org/satcat/records.php?NAME=${name}&FORMAT=json`;

const cachePath = (dir, url) => join(dir, `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.json`);

async function readCache(file, ttlMs, now) {
  try {
    const c = JSON.parse(await readFile(file, "utf8"));
    if (now - Date.parse(c.fetchedAt) < ttlMs) return c;
  } catch { /* missing or corrupt cache means refetch */ }
  return null;
}

/**
 * Fetch JSON with disk cache. Returns { data, fetchedAt, url, fromCache }.
 * Throws on any non-200 (no retry) or a non-array/object body.
 */
export async function fetchCelestrak(url, {
  fetchImpl = politeFetch, cacheDir = CACHE_DIR, ttlMs = TTL_MS, now = Date.now(),
} = {}) {
  const file = cachePath(cacheDir, url);
  const hit = await readCache(file, ttlMs, now);
  if (hit) return { data: hit.data, fetchedAt: hit.fetchedAt, url, fromCache: true };

  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (res.status !== 200) {
    throw Object.assign(new Error(`CelesTrak ${res.status} for ${url}; stopping per usage policy`), { status: res.status });
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`CelesTrak returned non-JSON for ${url}: ${text.slice(0, 80)}`); }
  if (!Array.isArray(data)) throw new Error(`CelesTrak returned a non-array for ${url}: ${text.slice(0, 80)}`);
  const fetchedAt = new Date(now).toISOString();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, JSON.stringify({ fetchedAt, url, data }));
  return { data, fetchedAt, url, fromCache: false };
}

/** Sequential fetches of GP + SATCAT for one constellation. */
export async function fetchConstellation({ group, catalogName }, opts) {
  const gp = await fetchCelestrak(gpUrl(group), opts);
  const satcat = await fetchCelestrak(satcatUrl(catalogName), opts);
  return { gp, satcat };
}

export const CONSTELLATIONS = {
  leo: { label: "Amazon Leo", group: "kuiper", catalogName: "KUIPER" },
  starlink: { label: "Starlink", group: "starlink", catalogName: "STARLINK" },
};
