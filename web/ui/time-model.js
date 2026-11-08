// Pure model for the time bar. No DOM.
import { formatShortDate, formatLocalTime } from "./format.js";

export const SLIDER_MIN = -24 * 60;
export const SLIDER_MAX = 24 * 60;
export const SPEEDS = [1, 60, 600];
export const WARN_HOURS = 72;
export const ACCURACY_WARNING = "Positions less accurate this far from the orbit data";
const MIN = 60000;

/** Sim date for a slider offset in minutes from now (now floored to the minute, so it snaps to 1 min). */
export function offsetToDate(minutes, now = Date.now()) {
  const m = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(minutes)));
  return new Date(Math.floor(now / MIN) * MIN + m * MIN);
}

/** Whole-minute offset of a date from now, unclamped. */
export function dateToOffset(date, now = Date.now()) {
  // Relative to the actual now (not the floored minute), so a live clock reads "now" instead of drifting to "+1 min".
  return Math.round((new Date(date).getTime() - now) / MIN);
}

/** "+3 h 20 min", "-45 min", "+1 d 3 h". */
export function offsetText(minutes) {
  const m = Math.round(minutes);
  if (m === 0) return "now";
  const sign = m < 0 ? "-" : "+";
  const a = Math.abs(m);
  if (a >= 2880) {
    const d = Math.floor(a / 1440), hh = Math.floor((a % 1440) / 60);
    return `${sign}${d} d${hh ? ` ${hh} h` : ""}`;
  }
  const hh = Math.floor(a / 60), mm = a % 60;
  return `${sign}${[hh ? `${hh} h` : "", mm ? `${mm} min` : ""].filter(Boolean).join(" ")}`;
}

/** "Sim time Nov 8, 2:14 AM (+3 h 20 min)". */
export function timeLabel(date, now = Date.now()) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Sim time unknown";
  return `Sim time ${formatShortDate(d)}, ${formatLocalTime(d)} (${offsetText(dateToOffset(d, now))})`;
}

/** Warning when the sim time is more than 72 h from the element epoch (gpMeta.epochAt, else fetchedAt); null when unknown. */
export function accuracyWarning(date, gpMeta) {
  const t = new Date(date).getTime(), f = new Date(gpMeta?.epochAt || gpMeta?.fetchedAt).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(f)) return null;
  return Math.abs(t - f) > WARN_HOURS * 3600000 ? ACCURACY_WARNING : null;
}
