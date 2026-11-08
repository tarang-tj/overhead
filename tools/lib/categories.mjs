// CelesTrak GP group -> category key, and the categories.json builder.
//
// UNVERIFIED from this machine: CelesTrak returned HTTP 403 to this IP on
// 2026-11-07, so none of these group names (other than kuiper and starlink,
// which are cached) have been checked against the live index. The CI run must
// log every group that returns non-200 or zero rows; a missing group is skipped
// and logged, never fatal (see fetchCategoryGroups in build-categories.mjs).

export const CATEGORY_KEYS = ["stations", "navigation", "weather", "earth", "science", "comms", "starlink", "leo", "other"];

/** Priority, highest first (interfaces-v2.md): leo, starlink, stations, navigation, weather, earth, science, comms, other. */
export const PRIORITY = ["leo", "starlink", "stations", "navigation", "weather", "earth", "science", "comms", "other"];

const names = (category, list) => list.map((g) => [g, category]);

export const GROUP_CATEGORY = Object.fromEntries([
  ...names("leo", ["kuiper"]),
  ...names("starlink", ["starlink"]),
  ...names("stations", ["stations"]),
  ...names("navigation", ["gnss", "gps-ops", "glo-ops", "galileo", "beidou", "sbas", "nnss", "musson"]),
  ...names("weather", ["weather", "noaa", "goes"]),
  ...names("earth", ["resource", "sarsat", "dmc", "argos", "planet", "spire"]),
  ...names("science", ["science", "geodetic", "engineering", "education"]),
  ...names("comms", [
    "tdrss", "geo", "intelsat", "ses", "iridium", "iridium-NEXT", "oneweb", "orbcomm", "globalstar", "swarm",
    "amateur", "x-comm", "other-comm", "satnogs", "gorizont", "raduga", "molniya",
  ]),
  ...names("other", ["military", "radar"]),
]);

const rank = (cat) => PRIORITY.indexOf(cat);

/** Winning category for a set of group names; "other" when none is mapped. */
export function pickCategory(groupNames) {
  let best = "other";
  for (const g of groupNames) {
    const c = GROUP_CATEGORY[g];
    if (c && rank(c) < rank(best)) best = c;
  }
  return best;
}

/**
 * membership: { group: noradId[] } for groups that were fetched.
 * activeIds: optional Set; ids outside it are ignored.
 * Returns the categories.json object plus `categoryByNorad` (Map) for callers.
 */
export function buildCategories({ membership, activeIds = null, generatedAt, source }) {
  const groupsOf = new Map();
  for (const [g, ids] of Object.entries(membership)) {
    for (const id of ids) {
      if (activeIds && !activeIds.has(id)) continue;
      if (!groupsOf.has(id)) groupsOf.set(id, []);
      groupsOf.get(id).push(g);
    }
  }
  const byCategory = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));
  const categoryByNorad = new Map();
  for (const [id, gs] of groupsOf) {
    const c = pickCategory(gs);
    categoryByNorad.set(id, c);
    if (c !== "other") byCategory[c].push(id);
  }
  for (const k of CATEGORY_KEYS) byCategory[k].sort((a, b) => a - b);
  // "other" is the default for anything unlisted, so its list stays empty.
  delete byCategory.other;
  const groups = Object.fromEntries(Object.keys(membership).map((g) => [g, GROUP_CATEGORY[g] ?? "other"]));
  return { json: { generatedAt, source, groups, byCategory }, categoryByNorad };
}
