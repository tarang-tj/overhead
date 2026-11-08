// Minimal OMM fields json2satrec needs (verified: identical SGP4 output to the full record).
export const OMM_FIELDS = [
  "OBJECT_NAME", "NORAD_CAT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION",
  "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT",
];

export function minimalOmm(row) {
  const out = {};
  for (const f of OMM_FIELDS) {
    if (row[f] === undefined || row[f] === null) throw new Error(`GP row ${row.NORAD_CAT_ID} missing ${f}`);
    out[f] = row[f];
  }
  return out;
}

/**
 * Snapshot of the active group: { fetchedAt, source, sats: [{ c, omm }] } where
 * c is the category key (default "other"). Rows missing a required field are
 * skipped and counted, so one bad record cannot sink a 14k-row build.
 */
export function buildSnapshotObject({ rows, categoryByNorad = new Map(), fetchedAt }) {
  const sats = [];
  let skipped = 0;
  for (const r of rows) {
    try { sats.push({ c: categoryByNorad.get(r.NORAD_CAT_ID) ?? "other", omm: minimalOmm(r) }); } catch { skipped += 1; }
  }
  return {
    fetchedAt,
    source: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
    sats,
    skipped,
  };
}
