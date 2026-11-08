// Full v2 refresh. Order matters for CelesTrak politeness: GP active first and
// fatal on failure (non-200 stops the run), then line (kuiper/starlink GP +
// SATCAT by name), category groups (skip and log), SATCAT active, snapshot, passes.
// Every URL is fetched once per run (2 h disk cache) with >= 1 s between calls.
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCategoriesFile, buildSatcatFile } from "./build-categories.mjs";
import { buildHorizon } from "./build-horizon.mjs";
import { buildLine, OUT_DIR } from "./build-line.mjs";
import { buildPasses } from "./build-passes.mjs";
import { buildSnapshot, fetchActive } from "./build-snapshot.mjs";
import { unmappedOwners } from "./lib/satcat-lite.mjs";

const exists = (p) => access(p).then(() => true, () => false);
const timed = async (label, fn) => {
  const t = Date.now();
  const r = await fn();
  console.log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return r;
};
const write = (name, obj) => mkdir(OUT_DIR, { recursive: true }).then(() => writeFile(join(OUT_DIR, name), JSON.stringify(obj)));

async function main() {
  // 1. Active GP: the product. Any failure here is fatal for the run.
  const active = await timed("gp active", fetchActive);
  const activeIds = new Set(active.data.map((r) => r.NORAD_CAT_ID));
  console.log("gp active:", active.data.length, "objects, fromCache", active.fromCache);

  // 2. The Line (kuiper + starlink).
  const line = await timed("line", () => buildLine());
  for (const [k, c] of Object.entries(line.constellations)) console.log(k, c.inOrbit, c.stages, c.impliedRaiseDays);

  // 3. Categories: per-group failures are logged and skipped.
  const cats = await timed("categories", () => buildCategoriesFile({ activeIds }));
  await write("categories.json", cats.json);
  console.log("categories:", Object.fromEntries(Object.entries(cats.json.byCategory).map(([k, v]) => [k, v.length])));
  console.log("categories: groups used", Object.keys(cats.json.groups).length, "skipped", JSON.stringify(cats.skipped));

  // 4. SATCAT lite.
  const sc = await timed("satcat", () => buildSatcatFile({ activeIds }));
  await write("satcat-lite.json", sc.lite);
  console.log("satcat-lite:", Object.keys(sc.lite.rows).length, "rows via", sc.via, "| owner codes not in map:", unmappedOwners(sc.lite).join(",") || "none");

  // 5. Snapshot (active, with categories).
  console.log("snapshot", await timed("snapshot", () => buildSnapshot({ active, categoryByNorad: cats.categoryByNorad })));

  // 6. Passes over UWB: leo + starlink + stations.
  const passes = await timed("passes", () => buildPasses());
  await write("passes.json", passes);
  console.log("passes", passes.counts, `step ${passes.stepSec} s`);

  // 7. Horizon: only when missing or --horizon.
  const horizonPath = join(OUT_DIR, "horizon.json");
  if (process.argv.includes("--horizon") || !(await exists(horizonPath))) {
    const h = await timed("horizon", () => buildHorizon());
    await write("horizon.json", h);
    console.log("horizon max", Math.max(...h.horizonElDeg));
  } else console.log("horizon: kept existing (pass --horizon to rebuild)");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
