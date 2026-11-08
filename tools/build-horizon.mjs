// Writes web/data/horizon.json: terrain horizon angle per azimuth from UWB.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UWB } from "../web/orbit/sky.js";
import { elevations } from "./lib/elevation.mjs";
import {
  RAY_STEP_DEG, destination, distanceBearing, elevationAngleDeg, interpolateRing, rayDistancesKm, rayHorizonDeg,
} from "./lib/horizon.mjs";
import { OUT_DIR } from "./build-line.mjs";

export const PEAKS = [
  { name: "Mount Rainier", latDeg: 46.8523, lonDeg: -121.7603 },
  { name: "Mount Baker", latDeg: 48.7767, lonDeg: -121.8144 },
  { name: "Mount Olympus", latDeg: 47.8013, lonDeg: -123.7108 },
  { name: "Glacier Peak", latDeg: 48.1125, lonDeg: -121.1139 },
];
const r2 = (x) => Math.round(x * 100) / 100;

export async function buildHorizon(opts = {}) {
  const dists = rayDistancesKm();
  const pts = [UWB, ...PEAKS];
  for (let az = 0; az < 360; az += RAY_STEP_DEG) for (const d of dists) pts.push(destination(UWB.latDeg, UWB.lonDeg, az, d));
  const h = await elevations(pts, opts);
  const obsM = UWB.heightKm * 1000;
  const peaks = PEAKS.map((p, i) => {
    const { distanceKm, azDeg } = distanceBearing(UWB, p);
    return {
      ...p, azDeg: r2(azDeg), distanceKm: r2(distanceKm), summitM: h[1 + i],
      elDeg: r2(elevationAngleDeg(distanceKm, h[1 + i], obsM)),
    };
  });
  let k = 1 + PEAKS.length;
  const rays = [];
  for (let az = 0; az < 360; az += RAY_STEP_DEG) {
    const samples = dists.map((distKm) => ({ distKm, heightM: h[k++] }));
    rays.push(rayHorizonDeg(samples, obsM));
  }
  const horizonElDeg = interpolateRing(rays, RAY_STEP_DEG).map(r2);
  return {
    observer: UWB, observerGroundM: h[0],
    source: "Copernicus DEM GLO-90 via Open-Meteo Elevation API",
    curvature: "geometric, R = 6371 km, no refraction",
    fetchedAt: new Date().toISOString(), azimuthStepDeg: 1, raySampleStepDeg: RAY_STEP_DEG, horizonElDeg, peaks,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildHorizon().then(async (out) => {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, "horizon.json"), JSON.stringify(out));
    const max = Math.max(...out.horizonElDeg);
    console.log("max horizon", max, "at az", out.horizonElDeg.indexOf(max), "obs ground m", out.observerGroundM);
    console.log(out.peaks);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
