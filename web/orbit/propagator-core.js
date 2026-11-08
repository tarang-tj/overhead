// Pure SGP4 sweep logic shared by the worker, the main-thread fallback and the
// Node tests. The satellite.js module is injected (`lib`) because a browser
// worker cannot use the page's import map: the worker passes the CDN build,
// everything else passes the bare-specifier build.
//
// flags[i]: 0 = sunlit, 1 = in Earth's shadow, 2 = no valid position (bad OMM
// or SGP4 error). positions[3i..3i+2] are ECI km, zeros when flag is 2.

export const FLAG_SUNLIT = 0;
export const FLAG_SHADOW = 1;
export const FLAG_INVALID = 2;

const EARTH_RADIUS_KM = 6378.137;
const MIN_PER_DAY = 1440;

/** Build satrecs from OMM objects. A bad OMM yields null in its slot; never throws. */
export function buildSatrecs(lib, omms) {
  const out = new Array(omms.length);
  for (let i = 0; i < omms.length; i++) {
    try {
      const rec = lib.json2satrec(omms[i]);
      out[i] = rec && !rec.error ? rec : null;
    } catch {
      out[i] = null;
    }
  }
  return out;
}

/**
 * Propagate every satrec to `date`. Writes into `positions` (Float32Array, 3n)
 * and `flags` (Uint8Array, n); returns the number of valid satellites.
 * `sun` is a unit ECI vector toward the Sun (cylindrical shadow test, same
 * math as sky.js isSunlit).
 */
export function sweep(lib, satrecs, date, sun, positions, flags) {
  const j = lib.jday(date);
  let valid = 0;
  for (let i = 0; i < satrecs.length; i++) {
    const rec = satrecs[i];
    let p = null;
    if (rec) {
      try {
        const pv = lib.sgp4(rec, (j - rec.jdsatepoch) * MIN_PER_DAY);
        p = pv && pv.position;
      } catch {
        p = null;
      }
    }
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      positions[3 * i] = positions[3 * i + 1] = positions[3 * i + 2] = 0;
      flags[i] = FLAG_INVALID;
      continue;
    }
    positions[3 * i] = p.x;
    positions[3 * i + 1] = p.y;
    positions[3 * i + 2] = p.z;
    flags[i] = inShadow(p, sun) ? FLAG_SHADOW : FLAG_SUNLIT;
    valid++;
  }
  return valid;
}

function inShadow(r, s) {
  const along = r.x * s.x + r.y * s.y + r.z * s.z;
  if (along >= 0) return false;
  const px = r.x - along * s.x, py = r.y - along * s.y, pz = r.z - along * s.z;
  return Math.hypot(px, py, pz) <= EARTH_RADIUS_KM;
}
