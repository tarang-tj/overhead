// Pure formatting helpers. No DOM, no globals, safe to import from Node tests.

export const TZ = "America/Los_Angeles";
const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** 16-point compass name for an azimuth in degrees from north. */
export function direction16(az) {
  if (!Number.isFinite(az)) return "?";
  const a = ((az % 360) + 360) % 360;
  return DIRS[Math.round(a / 22.5) % 16];
}

// Newer ICU puts a narrow no-break space before AM/PM; normalize to a plain space.
const clean = (s) => s.replace(/[  ]/g, " ");

/** "6:12 PM" in the given IANA zone. Returns "?" for an invalid date. */
export function formatLocalTime(iso, tz = TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return clean(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }));
}

/** "Nov 6, 2026" in the given IANA zone. */
export function formatLocalDate(iso, tz = TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
}

/** Month and day only ("Nov 7"), for rows inside a dated list. */
export function formatShortDate(iso, tz = TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

/** Age in ms to a short phrase: "just now", "5 min", "2 h", "3 d". */
export function relativeAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "unknown age";
  const min = ms / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

/**
 * Stage funnel from a constellation's stage counts. Percent is of launched,
 * so every bar reads as "share of everything ever put up".
 */
export function funnelRows(stages = {}) {
  const launched = Number(stages.launched) || 0;
  const defs = [
    ["launched", "Launched", launched],
    ["raising", "Raising", stages.raising],
    ["onStation", "On station", stages.onStation],
    ["descending", "Descending", stages.descending],
    ["decayed", "Decayed", stages.decayed],
  ];
  return defs.map(([key, label, n]) => {
    const count = Number(n) || 0;
    const pct = launched > 0 ? Math.min(100, Math.round((count / launched) * 1000) / 10) : 0;
    return { key, label, count, pct };
  });
}

/** Pad a [{month,count}] list into the last `n` calendar months ending at `endIso`'s month. */
export function lastMonths(series = [], endIso, n = 24) {
  const end = new Date(endIso);
  const base = Number.isNaN(end.getTime()) ? new Date() : end;
  let y = base.getUTCFullYear();
  let m = base.getUTCMonth();
  const byMonth = new Map(series.map((s) => [s.month, Number(s.count) || 0]));
  const out = [];
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.unshift({ month: key, count: byMonth.get(key) || 0 });
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
