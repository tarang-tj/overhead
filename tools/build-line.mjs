// Writes web/data/line.json from CelesTrak GP + SATCAT (cached 2 h).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONSTELLATIONS, fetchConstellation } from "./lib/celestrak.mjs";
import { buildConstellation } from "./lib/line.mjs";

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "data");

export async function buildLine({ now = new Date() } = {}) {
  const out = { generatedAt: now.toISOString(), sources: {}, constellations: {} };
  const perKey = {};
  for (const [key, c] of Object.entries(CONSTELLATIONS)) {
    const { gp, satcat } = await fetchConstellation(c);
    perKey[key] = {
      gp: { url: gp.url, fetchedAt: gp.fetchedAt },
      satcat: { url: satcat.url, fetchedAt: satcat.fetchedAt },
    };
    out.constellations[key] = buildConstellation({
      key, label: c.label, catalogName: c.catalogName, gp: gp.data, satcat: satcat.data, now,
    });
  }
  // Top-level gp/satcat follow interfaces.md (base URL, oldest fetch); per-constellation URLs are extra.
  const oldest = (k) => Object.values(perKey).map((p) => p[k].fetchedAt).sort()[0];
  out.sources = {
    gp: { url: "https://celestrak.org/NORAD/elements/gp.php", fetchedAt: oldest("gp") },
    satcat: { url: "https://celestrak.org/satcat/records.php", fetchedAt: oldest("satcat") },
    perConstellation: perKey,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "line.json"), JSON.stringify(out, null, 1));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildLine().then((o) => {
    for (const [k, c] of Object.entries(o.constellations)) console.log(k, c.inOrbit, c.stages, c.impliedRaiseDays);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
