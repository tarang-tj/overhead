// Pure models for header counts, observer/location copy, search and the category legend. No DOM.
import { plural, formatLocalTime } from "./format.js";

export const DEFAULT_CATEGORIES = [
  { key: "stations", label: "Stations", color: "#ffffff" },
  { key: "navigation", label: "Navigation", color: "#c9a0ff" },
  { key: "weather", label: "Weather", color: "#5fd3e0" },
  { key: "earth", label: "Earth", color: "#7fd6a0" },
  { key: "science", label: "Science", color: "#ff9ecb" },
  { key: "comms", label: "Comms", color: "#9aa8c2" },
  { key: "starlink", label: "Starlink", color: "#9ec5ff" },
  { key: "leo", label: "Amazon Leo", color: "#f5a524" },
  { key: "other", label: "Other", color: "#6b7690" },
];

export const UWB_LABEL = "over UW Bothell";
export const YOU_LABEL = "over your location";
export const LOCATION_ERROR = "Location unavailable, showing UW Bothell";
export const FLAT_HORIZON_NOTE = "Flat horizon: terrain is modeled only at UW Bothell";

const sum = (o) => Object.values(o || {}).reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0);

export const LOADING_TEXT = "Loading satellites...";
export const COUNTS_CAPTION = "Counts are satellites above the horizon";

/**
 * "Above UW Bothell now: N satellites, M sunlit in a dark sky". Says "you" only for a real location, and
 * "at <time>" when the sim clock is 1 min or more from now. Null until the renderer reports per-category counts.
 * opts: { you: boolean, simDate: Date|null, now: number }
 */
export function headerText(stats, { you = false, simDate = null, now = Date.now() } = {}) {
  if (!stats || !stats.aboveHorizonByCategory) return null;
  if (typeof stats.propagated === "number" && !(stats.propagated > 0)) return LOADING_TEXT;
  const seeable = Number.isFinite(stats.seeableNow) ? stats.seeableNow : 0;
  const shifted = simDate && Math.abs(new Date(simDate).getTime() - now) >= 60000;
  const when = shifted ? `at ${formatLocalTime(simDate)}` : "now";
  return `Above ${you ? "you" : "UW Bothell"} ${when}: ${plural(sum(stats.aboveHorizonByCategory), "satellite")}, ${seeable} sunlit in a dark sky`;
}

export const observerLabel = (isYou) => (isYou ? YOU_LABEL : UWB_LABEL);

/** Observer for the app from a geolocation position, or null when the coordinates are unusable. */
export function observerFromPosition(pos) {
  const c = pos && pos.coords;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  if (Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180) return null;
  const heightKm = Number.isFinite(c.altitude) ? c.altitude / 1000 : 0;
  return { name: "Your location", latDeg: c.latitude, lonDeg: c.longitude, heightKm };
}

/** Same copy for every failure (denied, timeout, unsupported); the reason only goes to the console. */
export const locationErrorText = () => LOCATION_ERROR;

// ---- search ----
export const NOTABLE = [[25544, "ISS"], [20580, "Hubble"], [48274, "Tiangong"], [43013, "NOAA 20"]];

/** Chips for notable satellites that are actually in the index. */
export function notableChips(satIndex) {
  const have = new Set((satIndex || []).map((s) => s.noradId));
  return NOTABLE.filter(([id]) => have.has(id)).map(([noradId, label]) => ({ noradId, label }));
}

/** Rank: exact id, exact name, name prefix, id prefix, name contains. Then shorter name, then A to Z. */
export function searchSats(satIndex, query, limit = 8) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q || !Array.isArray(satIndex)) return [];
  const digits = /^\d+$/.test(q);
  // A query that names a notable satellite ("iss", "hubble") puts that one first.
  const notableHit = (NOTABLE.find(([, label]) => label.toLowerCase() === q) || [])[0] ?? null;
  const hits = [];
  for (const s of satIndex) {
    const name = String(s.name ?? "").toLowerCase();
    const id = String(s.noradId);
    let rank = -1;
    if (notableHit === s.noradId) rank = -1.5; // "iss" means the station, not a module named ISS (...)
    else if (digits && id === q) rank = 0;
    else if (name === q) rank = 1;
    else if (name.startsWith(q)) rank = 2;
    else if (digits && id.startsWith(q)) rank = 3;
    else if (name.includes(q)) rank = 4;
    if (rank !== -1) hits.push({ s, rank, name });
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return hits.slice(0, limit).map((x) => x.s);
}

// ---- legend / filter ----
/** Chips with live counts. active: null (all shown) or an array of keys. */
export function legendModel(categories, counts, active) {
  const on = active ? new Set(active) : null;
  return {
    allPressed: !on,
    chips: categories.map((c) => ({ ...c, count: counts?.[c.key] ?? 0, pressed: !!on && on.has(c.key) })),
  };
}

/** Tap a category. From "all" it selects just that one; further taps add or remove; empty or full goes back to all. */
export function toggleFilter(active, key, allKeys) {
  const set = new Set(active || []);
  if (!active) return [key];
  if (set.has(key)) set.delete(key); else set.add(key);
  if (set.size === 0 || set.size === allKeys.length) return null;
  return allKeys.filter((k) => set.has(k));
}
