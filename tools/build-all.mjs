// Runs the whole pipeline: line (2), snapshot (5), passes (3), horizon (4).
// Line and snapshot share the GP download through the 2 h cache. Horizon is
// rebuilt only when horizon.json is missing or --horizon is passed.
import { access } from "node:fs/promises";
import { join } from "node:path";
import { buildHorizon } from "./build-horizon.mjs";
import { buildLine, OUT_DIR } from "./build-line.mjs";
import { buildPasses } from "./build-passes.mjs";
import { buildSnapshot } from "./build-snapshot.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const exists = (p) => access(p).then(() => true, () => false);
const timed = async (label, fn) => {
  const t = Date.now();
  const r = await fn();
  console.log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return r;
};
const write = (name, obj) => mkdir(OUT_DIR, { recursive: true }).then(() => writeFile(join(OUT_DIR, name), JSON.stringify(obj)));

async function main() {
  const line = await timed("line", () => buildLine());
  for (const [k, c] of Object.entries(line.constellations)) console.log(k, c.inOrbit, c.stages, c.impliedRaiseDays);
  console.log("snapshot", await timed("snapshot", buildSnapshot));
  const passes = await timed("passes", () => buildPasses());
  await write("passes.json", passes);
  console.log("passes", passes.counts, `step ${passes.stepSec} s`);
  const horizonPath = join(OUT_DIR, "horizon.json");
  if (process.argv.includes("--horizon") || !(await exists(horizonPath))) {
    const h = await timed("horizon", () => buildHorizon());
    await write("horizon.json", h);
    console.log("horizon max", Math.max(...h.horizonElDeg));
  } else console.log("horizon: kept existing (pass --horizon to rebuild)");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
