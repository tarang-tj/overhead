// Full v2 refresh, all-or-nothing. Every artifact is built in memory; web/data
// is touched only after the whole CelesTrak part succeeded, so a block (403/429)
// or any failure leaves the previously committed data untouched and exits non-zero.
// Every URL is fetched once per run (2 h disk cache) with >= 1 s between calls.
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCategoriesFile, buildSatcatFile } from "./build-categories.mjs";
import { buildHorizon } from "./build-horizon.mjs";
import { buildLine, OUT_DIR } from "./build-line.mjs";
import { buildPasses } from "./build-passes.mjs";
import { buildSnapshot, fetchActive } from "./build-snapshot.mjs";
import { unmappedOwners } from "./lib/satcat-lite.mjs";

const exists = (p) => access(p).then(() => true, () => false);

/** Write every staged file to <name>.tmp first, then rename all: the failure window is tiny. */
export async function commitFiles(outDir, files) {
  await mkdir(outDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(outDir, `${name}.tmp`), text);
  for (const name of Object.keys(files)) await rename(join(outDir, `${name}.tmp`), join(outDir, name));
}

export async function refresh({ outDir = OUT_DIR, fetchOpts, withHorizon = false, log = console.log } = {}) {
  const timed = async (label, fn) => {
    const t = Date.now();
    const r = await fn();
    log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
    return r;
  };
  const files = {};
  const active = await timed("gp active", () => fetchActive(fetchOpts));
  const activeIds = new Set(active.data.map((r) => r.NORAD_CAT_ID));
  log("gp active:", active.data.length, "objects, fromCache", active.fromCache);

  const line = await timed("line", () => buildLine({ fetchOpts, write: false }));
  files["line.json"] = JSON.stringify(line, null, 1);
  for (const [k, c] of Object.entries(line.constellations)) log(k, c.inOrbit, c.stages, c.impliedRaiseDays);

  const cats = await timed("categories", () => buildCategoriesFile({ activeIds, fetchOpts }));
  files["categories.json"] = JSON.stringify(cats.json);
  log("categories:", Object.fromEntries(Object.entries(cats.json.byCategory).map(([k, v]) => [k, v.length])));
  log("categories: groups used", Object.keys(cats.json.groups).length, "skipped", JSON.stringify(cats.skipped));

  const sc = await timed("satcat", () => buildSatcatFile({ activeIds, fetchOpts }));
  files["satcat-lite.json"] = JSON.stringify(sc.lite);
  log("satcat-lite:", Object.keys(sc.lite.rows).length, "rows via", sc.via, "| owner codes not in map:", unmappedOwners(sc.lite).join(",") || "none");

  const { text, ...snapInfo } = await timed("snapshot", () => buildSnapshot({ active, categoryByNorad: cats.categoryByNorad, write: false }));
  files["gp-snapshot.json"] = text;
  log("snapshot", snapInfo);

  const passes = await timed("passes", () => buildPasses({ fetchOpts }));
  files["passes.json"] = JSON.stringify(passes);
  log("passes", passes.counts, `step ${passes.stepSec} s`);

  if (withHorizon || !(await exists(join(outDir, "horizon.json")))) {
    const h = await timed("horizon", () => buildHorizon());
    files["horizon.json"] = JSON.stringify(h);
    log("horizon max", Math.max(...h.horizonElDeg));
  } else log("horizon: kept existing (pass --horizon to rebuild)");

  await commitFiles(outDir, files);
  log("wrote", Object.keys(files).join(", "));
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refresh({ withHorizon: process.argv.includes("--horizon") }).catch((e) => {
    console.error(`build-all failed, web/data left unchanged: ${e.message}`);
    process.exit(1);
  });
}
