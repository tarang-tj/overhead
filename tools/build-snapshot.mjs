// Writes web/data/gp-snapshot.json: compact GP fallback (the active group) for when the live fetch fails.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCelestrak, gpUrl } from "./lib/celestrak.mjs";
import { buildSnapshotObject } from "./lib/snapshot.mjs";
import { OUT_DIR } from "./build-line.mjs";

/** Fatal on any non-200: the active group is the product. */
export const fetchActive = (opts) => fetchCelestrak(gpUrl("active"), opts);

export async function buildSnapshot({ active, categoryByNorad, write = true } = {}) {
  const r = active ?? (await fetchActive());
  const snap = buildSnapshotObject({ rows: r.data, categoryByNorad, fetchedAt: r.fetchedAt });
  const text = JSON.stringify(snap);
  if (write) {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, "gp-snapshot.json"), text);
  }
  return { count: snap.sats.length, skipped: snap.skipped, bytes: text.length, text };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSnapshot().then(({ text, ...r }) => console.log("snapshot", r)).catch((e) => { console.error(e.message); process.exit(1); });
}
