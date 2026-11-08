// Open-Meteo Elevation API client: 100 coordinates per call, polite delay,
// disk cache so reruns do not re-query. Any non-200 throws (no retry loop).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR, USER_AGENT } from "./celestrak.mjs";

const BASE = "https://api.open-meteo.com/v1/elevation";
const BATCH = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x) => x.toFixed(4);

async function fetchBatch(points, { fetchImpl, cacheDir, retryWaitMs }) {
  const url = `${BASE}?latitude=${points.map((p) => fmt(p.latDeg)).join(",")}&longitude=${points.map((p) => fmt(p.lonDeg)).join(",")}`;
  const file = join(cacheDir, `om-${createHash("sha1").update(url).digest("hex").slice(0, 16)}.json`);
  try { return { heights: JSON.parse(await readFile(file, "utf8")), cached: true }; } catch { /* miss */ }
  let res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  // Open-Meteo asks clients to wait a minute after a minutely 429; one wait, then stop.
  if (res.status === 429 && retryWaitMs > 0) {
    await sleep(retryWaitMs);
    res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  }
  if (res.status !== 200) throw new Error(`Open-Meteo elevation ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const body = await res.json();
  if (!Array.isArray(body.elevation) || body.elevation.length !== points.length) {
    throw new Error("Open-Meteo elevation: unexpected response shape");
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, JSON.stringify(body.elevation));
  return { heights: body.elevation, cached: false };
}

/** Heights (m) for each point, same order. */
export async function elevations(points, { fetchImpl = globalThis.fetch, cacheDir = CACHE_DIR, delayMs = 1500, retryWaitMs = 65000 } = {}) {
  const out = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const { heights, cached } = await fetchBatch(points.slice(i, i + BATCH), { fetchImpl, cacheDir, retryWaitMs });
    out.push(...heights);
    if (!cached) await sleep(delayMs);
  }
  return out;
}
