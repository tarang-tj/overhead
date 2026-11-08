// satcat-lite.json builder: owner, launch date/site and international designator per active NORAD id.

/**
 * Owner code -> readable name. Only "US" is confirmed against real SATCAT rows
 * in tools/cache (every Starlink and Kuiper row). The rest are CelesTrak SATCAT
 * source codes from memory and UNVERIFIED here; the CI run should print codes
 * seen in the data that are missing from this map (see unmappedOwners).
 * Unknown codes pass through raw in the UI.
 */
export const OWNERS = {
  US: "United States", PRC: "China", CIS: "Russia (CIS)", ESA: "European Space Agency", JPN: "Japan", IND: "India",
  UK: "United Kingdom", FR: "France", GER: "Germany", SPN: "Spain", ITAL: "Italy", CA: "Canada", ISS: "International Space Station",
  ITSO: "Intelsat", SES: "SES", GLOB: "Globalstar", ORB: "Orbcomm", IRID: "Iridium", NZ: "New Zealand", ARGN: "Argentina",
  SKOR: "South Korea", AUS: "Australia", BRAZ: "Brazil", ISRA: "Israel", UAE: "United Arab Emirates", TURK: "Turkey",
  EUME: "EUMETSAT", EUTE: "Eutelsat", NATO: "NATO", O3B: "O3b Networks", TBD: "Unassigned",
};

const keepRow = (r) => [r.OWNER ?? "", r.LAUNCH_DATE ?? "", r.LAUNCH_SITE ?? "", r.OBJECT_ID ?? ""];

/**
 * rows: SATCAT records (JSON shape). activeIds: Set of NORAD ids from GP active;
 * when null, falls back to payloads with no decay date.
 */
export function buildSatcatLite({ rows, activeIds = null, generatedAt }) {
  const out = {};
  for (const r of rows) {
    const id = Number(r.NORAD_CAT_ID);
    if (!Number.isInteger(id)) continue;
    const keep = activeIds ? activeIds.has(id) : r.OBJECT_TYPE === "PAY" && !r.DECAY_DATE;
    if (keep) out[id] = keepRow(r);
  }
  return { generatedAt, owners: { ...OWNERS }, rows: out };
}

export const unmappedOwners = (lite) =>
  [...new Set(Object.values(lite.rows).map((r) => r[0]).filter((c) => c && !(c in lite.owners)))].sort();

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes), header row -> objects. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] === "" ? null : r[i]])));
}
