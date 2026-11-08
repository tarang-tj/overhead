// Pure aggregation: one constellation's GP + SATCAT rows -> the line.json block.
import {
  arrivalRatePerDay, classifyStage, countByMonth, findShells, littleLawDays,
} from "../../web/orbit/line-math.js";
import { meanAltitudeKm } from "../../web/orbit/sky.js";

export const FACTORIES = {
  leo: {
    city: "Kirkland, WA",
    note: "Amazon's satellite factory; Redmond is the design hub",
    sources: [
      "https://www.geekwire.com/2022/amazon-readies-kirkland-factory-to-build-kuiper-satellites/",
      "https://www.cnbc.com/2022/10/27/amazon-to-open-kuiper-internet-satellite-factory.html",
    ],
  },
  starlink: {
    city: "Redmond, WA",
    note: "SpaceX's Starlink satellite factory",
    sources: ["https://choosewashingtonstate.com/?p=30337"],
  },
};

/** Payloads only: SATCAT also lists debris (DEB) and rocket bodies (R/B). */
export const isPayload = (row) => !row.OBJECT_TYPE || row.OBJECT_TYPE === "PAY";

const day = (d) => (d ? String(d).slice(0, 10) : null);

export function altitudeKm(gpRow, satcatRow) {
  if (Number.isFinite(gpRow.MEAN_MOTION) && gpRow.MEAN_MOTION > 0) return meanAltitudeKm(gpRow.MEAN_MOTION);
  if (satcatRow && Number.isFinite(satcatRow.APOGEE) && Number.isFinite(satcatRow.PERIGEE)) {
    return (satcatRow.APOGEE + satcatRow.PERIGEE) / 2;
  }
  return NaN;
}

export function buildConstellation({ key, label, catalogName, gp, satcat, now }) {
  const payloads = satcat.filter(isPayload);
  const byId = new Map(payloads.map((r) => [r.NORAD_CAT_ID, r]));
  const altitudes = gp.map((g) => altitudeKm(g, byId.get(g.NORAD_CAT_ID)));
  const shells = findShells(altitudes);
  const stages = { raising: 0, onStation: 0, descending: 0, unknown: 0 };
  gp.forEach((g, i) => {
    const launch = byId.get(g.NORAD_CAT_ID)?.LAUNCH_DATE;
    stages[classifyStage(altitudes[i], shells, launch, now)] += 1;
  });
  const launchDates = payloads.map((r) => day(r.LAUNCH_DATE)).filter(Boolean);
  const decayDates = payloads.map((r) => day(r.DECAY_DATE)).filter(Boolean);
  const sites = {};
  for (const r of payloads) if (r.LAUNCH_SITE) sites[r.LAUNCH_SITE] = (sites[r.LAUNCH_SITE] || 0) + 1;
  const rate = arrivalRatePerDay(launchDates, now, 90);
  return {
    label,
    catalogName,
    factory: FACTORIES[key],
    shells,
    stages: { ...stages, decayed: decayDates.length, launched: payloads.length },
    inOrbit: gp.length,
    launchesByMonth: countByMonth(launchDates),
    decaysByMonth: countByMonth(decayDates),
    sites,
    lastLaunchDate: launchDates.sort().at(-1) ?? null,
    arrivalRatePerDay90: rate,
    impliedRaiseDays: littleLawDays(stages.raising, rate),
  };
}
