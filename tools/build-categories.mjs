// Builds web/data/categories.json and web/data/satcat-lite.json (CelesTrak GP groups and SATCAT).
import { fetchCelestrak, gpUrl, satcatActiveUrl, satcatCsvUrl, USER_AGENT, politeFetch } from "./lib/celestrak.mjs";
import { GROUP_CATEGORY, buildCategories } from "./lib/categories.mjs";
import { buildSatcatLite, parseCsv } from "./lib/satcat-lite.mjs";

const FATAL = new Set([403, 429]);

/**
 * One GET per group. A failed or empty group is skipped and logged (names are
 * unverified). 403/429 means we are blocked: stop fetching further groups.
 * Returns { membership, skipped: [{group, reason}] }.
 */
export async function fetchCategoryGroups({ groups = Object.keys(GROUP_CATEGORY), fetchOpts = {}, log = console.warn } = {}) {
  const membership = {};
  const skipped = [];
  for (const g of groups) {
    try {
      const { data } = await fetchCelestrak(gpUrl(g), fetchOpts);
      const ids = data.map((r) => r.NORAD_CAT_ID).filter(Number.isInteger);
      if (!ids.length) { skipped.push({ group: g, reason: "zero rows" }); log(`categories: group ${g} returned zero rows, skipped`); continue; }
      membership[g] = ids;
    } catch (e) {
      skipped.push({ group: g, reason: e.message });
      log(`categories: group ${g} skipped: ${e.message}`);
      if (FATAL.has(e.status)) { log("categories: blocked by CelesTrak, not fetching remaining groups"); break; }
    }
  }
  return { membership, skipped };
}

export async function buildCategoriesFile({ activeIds, generatedAt = new Date().toISOString(), ...opts }) {
  const { membership, skipped } = await fetchCategoryGroups(opts);
  const { json, categoryByNorad } = buildCategories({
    membership, activeIds, generatedAt, source: "https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=json",
  });
  return { json, categoryByNorad, skipped };
}

/** Primary: SATCAT GROUP=active JSON (UNVERIFIED). Fallback: daily satcat.csv, unless blocked (403/429). */
export async function fetchSatcatRows({ fetchOpts = {}, fetchImpl = politeFetch, log = console.warn } = {}) {
  try {
    const { data } = await fetchCelestrak(satcatActiveUrl, fetchOpts);
    if (data.length) return { rows: data, via: "GROUP=active json" };
    log("satcat: GROUP=active returned zero rows, trying satcat.csv");
  } catch (e) {
    if (FATAL.has(e.status)) throw e;
    log(`satcat: GROUP=active failed (${e.message}), trying satcat.csv`);
  }
  const res = await fetchImpl(satcatCsvUrl, { headers: { "User-Agent": USER_AGENT } });
  if (res.status !== 200) throw Object.assign(new Error(`CelesTrak ${res.status} for ${satcatCsvUrl}`), { status: res.status });
  return { rows: parseCsv(await res.text()), via: "satcat.csv" };
}

export async function buildSatcatFile({ activeIds, generatedAt = new Date().toISOString(), ...opts }) {
  const { rows, via } = await fetchSatcatRows(opts);
  return { lite: buildSatcatLite({ rows, activeIds, generatedAt }), via };
}
