// Writes web/data/passes.json: next 24 h of passes over UWB.
// Usage: node tools/build-passes.mjs [--start ISO] [--step SECONDS]
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UWB } from "../web/orbit/sky.js";
import { CONSTELLATIONS, fetchCelestrak, gpUrl } from "./lib/celestrak.mjs";
import { findPasses, makeTimes, satrecOrNull, sunTimeline } from "./lib/passes.mjs";
import { OUT_DIR } from "./build-line.mjs";

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

export async function buildPasses({ start = new Date(), hours = 24, stepSec = 20, gpByKey, keepAll = false } = {}) {
  const times = makeTimes(start, hours, stepSec);
  const sun = sunTimeline(times);
  const passes = [];
  const counts = {};
  for (const key of Object.keys(CONSTELLATIONS)) {
    const rows = gpByKey?.[key] ?? (await fetchCelestrak(gpUrl(CONSTELLATIONS[key].group))).data;
    counts[key] = { passes: 0, visible: 0 };
    for (const omm of rows) {
      const rec = satrecOrNull(omm);
      if (!rec) continue;
      for (const p of findPasses(rec, times, sun)) {
        passes.push({
          constellation: key, name: omm.OBJECT_NAME, noradId: omm.NORAD_CAT_ID,
          start: p.start, peak: p.peak, end: p.end,
          peakElDeg: round(p.peakElDeg), peakAzDeg: round(p.peakAzDeg),
          startAzDeg: round(p.startAzDeg), endAzDeg: round(p.endAzDeg), visible: p.visible,
        });
        counts[key].passes += 1;
        if (p.visible) counts[key].visible += 1;
      }
    }
  }
  passes.sort((a, b) => a.peak.localeCompare(b.peak));
  // Keep the file small enough to ship: every Leo pass, but only the visible Starlink
  // passes (counts below still cover all of them).
  const kept = keepAll ? passes : passes.filter((p) => p.visible || p.constellation === "leo");
  return {
    generatedAt: new Date().toISOString(), observer: UWB,
    windowStart: times[0].toISOString(), windowEnd: times.at(-1).toISOString(),
    minElDeg: 10, stepSec, passes: kept, counts,
    note: keepAll ? undefined : "passes lists every Leo pass and only the visible Starlink passes; counts cover all",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const startArg = argOf("--start");
  buildPasses({ start: startArg ? new Date(startArg) : new Date(), stepSec: Number(argOf("--step")) || 20 })
    .then(async (out) => {
      await mkdir(OUT_DIR, { recursive: true });
      await writeFile(join(OUT_DIR, "passes.json"), JSON.stringify(out));
      console.log(out.counts, `${((Date.now() - t0) / 1000).toFixed(1)} s, step ${out.stepSec} s`);
    }).catch((e) => { console.error(e.message); process.exit(1); });
}
