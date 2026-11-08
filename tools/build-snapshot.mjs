// Writes web/data/gp-snapshot.json: compact GP fallback for when the live fetch fails.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONSTELLATIONS, fetchCelestrak, gpUrl } from "./lib/celestrak.mjs";
import { buildSnapshotObject } from "./lib/snapshot.mjs";
import { OUT_DIR } from "./build-line.mjs";

export async function buildSnapshot() {
  const gpByKey = {};
  let oldest = null;
  for (const [key, c] of Object.entries(CONSTELLATIONS)) {
    const r = await fetchCelestrak(gpUrl(c.group));
    gpByKey[key] = r.data;
    if (!oldest || r.fetchedAt < oldest) oldest = r.fetchedAt;
  }
  const snap = buildSnapshotObject({ gpByKey, fetchedAt: oldest });
  await mkdir(OUT_DIR, { recursive: true });
  const text = JSON.stringify(snap);
  await writeFile(join(OUT_DIR, "gp-snapshot.json"), text);
  return { count: snap.sats.length, bytes: text.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSnapshot().then((r) => console.log("snapshot", r)).catch((e) => { console.error(e.message); process.exit(1); });
}
