// Data-to-model for the Line panel. Pure: no DOM.
import { funnelRows, lastMonths, formatLocalDate, formatLocalTime, relativeAge } from "./format.js";

const SITE_NAMES = {
  AFETR: "Cape Canaveral (AFETR)",
  AFWTR: "Vandenberg (AFWTR)",
  FRGUI: "Kourou (FRGUI)",
  TTMTR: "Baikonur (TTMTR)",
};

export const FCC_COPY =
  "FCC required half the constellation (1,616 of 3,232) by July 30, 2026; Amazon got a limited waiver in June 2026; full constellation due July 30, 2029 (IndexBox, June 2026).";

export function impliedText(c) {
  const d = c?.impliedRaiseDays;
  if (d === null || d === undefined || !Number.isFinite(d)) return "No launches in the catalog in the last 90 days, so Little's Law gives no raise time";
  return `Implied time to raise: ${Math.round(d)} days (Little's Law: raising / launch rate over 90 days)`;
}

export function shellsText(shells) {
  const list = (shells || []).filter((s) => Number.isFinite(s.minKm) && Number.isFinite(s.maxKm));
  if (!list.length) return "On station shells: not available";
  return `On station shells: ${list.map((s) => `${Math.round(s.minKm)}-${Math.round(s.maxKm)} km`).join(", ")}`;
}

export function sitesList(sites = {}) {
  return Object.entries(sites)
    .map(([code, count]) => ({ code, name: SITE_NAMES[code] || code, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count);
}

export function lastLaunchText(label, date) {
  return date ? `Last ${label} launch in the catalog: ${formatLocalDate(`${date}T12:00:00Z`)}` : `Last ${label} launch in the catalog: none found`;
}

export function constellationModel(key, c, generatedAt) {
  return {
    key,
    label: c.label,
    factory: {
      city: c.factory?.city || "unknown",
      note: c.factory?.note || "",
      sources: c.factory?.sources || [],
    },
    funnel: funnelRows(c.stages),
    unknown: Number(c.stages?.unknown) || 0,
    sites: sitesList(c.sites),
    launches: lastMonths(c.launchesByMonth, generatedAt, 24),
    decays: lastMonths(c.decaysByMonth, generatedAt, 24),
    implied: impliedText(c),
    shells: shellsText(c.shells),
    lastLaunch: lastLaunchText(c.label, c.lastLaunchDate),
    fcc: key === "leo" ? FCC_COPY : null,
  };
}

/** Whole-panel model, or null when line.json is missing or malformed. */
export function lineModel(line) {
  if (!line || !line.constellations) return null;
  const { leo, starlink } = line.constellations;
  if (!leo || !starlink) return null;
  const sources = [];
  for (const k of ["gp", "satcat"]) {
    const s = line.sources?.[k];
    if (s?.url) sources.push({ name: k === "gp" ? "CelesTrak GP" : "CelesTrak SATCAT", url: s.url });
  }
  return {
    columns: [constellationModel("leo", leo, line.generatedAt), constellationModel("starlink", starlink, line.generatedAt)],
    sources,
    generatedText: line.generatedAt
      ? `Aggregates generated ${formatLocalDate(line.generatedAt)} ${formatLocalTime(line.generatedAt)} Pacific`
      : "Aggregates generation time unknown",
  };
}

export const ageSince = (iso, now = Date.now()) => relativeAge(now - new Date(iso).getTime());
