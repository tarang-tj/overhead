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

export function buildSnapshotObject({ gpByKey, fetchedAt }) {
  const sats = [];
  for (const [c, rows] of Object.entries(gpByKey)) for (const r of rows) sats.push({ c, omm: minimalOmm(r) });
  return {
    fetchedAt,
    source: "https://celestrak.org/NORAD/elements/gp.php?GROUP=kuiper|starlink&FORMAT=json",
    sats,
  };
}
