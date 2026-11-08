// Pure "constellation as a supply chain" math, shared by the pipeline and UI.
// Stages: launched -> raising (work in progress) -> on station (finished
// goods) -> descending / decayed (retired). Thresholds are data-driven: the
// operational shells are the altitude modes that hold a real share of the
// fleet, not hard-coded numbers that rot when an operator moves a shell.

/** Histogram altitudes into bins and return shells (modes) holding >= minShare of the fleet. */
export function findShells(altitudesKm, { binKm = 10, minShare = 0.03 } = {}) {
  const alts = altitudesKm.filter((a) => Number.isFinite(a) && a > 150);
  if (alts.length === 0) return [];
  const bins = new Map();
  for (const a of alts) {
    const b = Math.floor(a / binKm) * binKm;
    bins.set(b, (bins.get(b) || 0) + 1);
  }
  const min = Math.max(1, Math.ceil(alts.length * minShare));
  const keys = [...bins.keys()].sort((x, y) => x - y);
  const shells = [];
  for (const k of keys) {
    const c = bins.get(k);
    if (c < min) continue;
    const prev = shells[shells.length - 1];
    // Merge adjacent qualifying bins into one shell.
    if (prev && k - prev.maxKm <= binKm) {
      prev.maxKm = k + binKm;
      prev.count += c;
    } else {
      shells.push({ minKm: k, maxKm: k + binKm, count: c });
    }
  }
  return shells.map((s) => ({ ...s, centerKm: (s.minKm + s.maxKm) / 2 }));
}

/**
 * Stage for one satellite. On station = inside a shell (with a small
 * tolerance) or above the highest shell. Anywhere else (below the lowest
 * shell, or in a gap between shells) it is "raising" if it launched recently
 * (still climbing) and "descending" if it is old (lowered for disposal or
 * decaying). No launch date means "unknown", never a guess.
 */
export function classifyStage(altKm, shells, launchDate, now, { toleranceKm = 15, raisingWindowDays = 180 } = {}) {
  if (!Number.isFinite(altKm) || shells.length === 0) return "unknown";
  for (const s of shells) {
    if (altKm >= s.minKm - toleranceKm && altKm <= s.maxKm + toleranceKm) return "onStation";
  }
  if (altKm > shells[shells.length - 1].maxKm + toleranceKm) return "onStation";
  if (!launchDate) return "unknown";
  const ageDays = (now.getTime() - new Date(launchDate).getTime()) / 86400000;
  if (!Number.isFinite(ageDays)) return "unknown";
  return ageDays <= raisingWindowDays ? "raising" : "descending";
}

/** Satellites launched per day over a trailing window ending at `now`. */
export function arrivalRatePerDay(launchDates, now, windowDays = 90) {
  const from = now.getTime() - windowDays * 86400000;
  const n = launchDates.filter((d) => {
    const t = new Date(d).getTime();
    return t >= from && t <= now.getTime();
  }).length;
  return n / windowDays;
}

/**
 * Little's Law: average time in a stage W = L / lambda, where L is the work
 * in progress (satellites raising) and lambda the arrival rate. Returns null
 * when there were no arrivals (the line is idle; W is undefined, not zero).
 */
export function littleLawDays(wip, ratePerDay) {
  if (!(ratePerDay > 0)) return null;
  return wip / ratePerDay;
}

/** Group ISO dates into YYYY-MM counts, sorted ascending. */
export function countByMonth(isoDates) {
  const m = new Map();
  for (const d of isoDates) {
    if (!d) continue;
    const k = String(d).slice(0, 7);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}
