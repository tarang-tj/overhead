// Data-to-model for the Tonight panel. Pure: no DOM.
import { direction16, formatLocalTime, formatLocalDate, formatShortDate, plural } from "./format.js";

export const LABELS = { leo: "Amazon Leo", starlink: "Starlink" };

export function directionText(p) {
  const rise = p.clippedStart ? `already up in the ${direction16(p.startAzDeg)}` : `rises ${direction16(p.startAzDeg)}`;
  const set = p.clippedEnd ? `still up at the end of the list` : `sets ${direction16(p.endAzDeg)}`;
  return `${rise}, peaks ${Math.round(p.peakElDeg)} deg ${direction16(p.peakAzDeg)}, ${set}`;
}

export function passRow(p, now = Date.now()) {
  return {
    noradId: p.noradId,
    constellation: p.constellation,
    chip: LABELS[p.constellation] || p.constellation,
    name: p.name,
    // Visible passes show when they become visible; dates included because the list spans two days.
    time: `${formatShortDate(p.visibleStart || p.start)}, ${formatLocalTime(p.visibleStart || p.start)}`,
    direction: directionText(p),
    peakEl: `${Math.round(p.peakElDeg)} deg`,
    visible: !!p.visible,
    past: new Date(p.end).getTime() < now,
  };
}

export const EMPTY_VISIBLE = (others) =>
  `No naked-eye-friendly passes in this window. ${plural(others, "pass", "passes")} overhead in daylight or shadow.`;

export function shareText(passes, now = Date.now()) {
  const vis = (passes?.passes || [])
    .filter((p) => p.visible && new Date(p.end).getTime() >= now)
    .sort((a, b) => new Date(a.visibleStart || a.start) - new Date(b.visibleStart || b.start));
  const tail = "Amazon Leo built in Kirkland, Starlink in Redmond. overhead";
  if (!vis.length) return `Tonight over UW Bothell: no visible satellite passes in this window. ${tail}`;
  return `Tonight over UW Bothell: ${plural(vis.length, "visible satellite pass", "visible satellite passes")}, first at ${formatLocalTime(vis[0].visibleStart || vis[0].start)}. ${tail}`;
}

/** Panel model. showAll=false keeps only passes with visible=true. Null when passes.json is missing. */
export function tonightModel(passes, { showAll = false, now = Date.now() } = {}) {
  if (!passes || !Array.isArray(passes.passes)) return null;
  const sorted = [...passes.passes].sort((a, b) => new Date(a.start) - new Date(b.start));
  const visibleCount = sorted.filter((p) => p.visible).length;
  const rows = (showAll ? sorted : sorted.filter((p) => p.visible)).map((p) => passRow(p, now));
  const other = sorted.length - visibleCount;
  return {
    rows,
    visibleCount,
    otherCount: other,
    empty: rows.length === 0 ? (showAll ? "No passes in this window." : EMPTY_VISIBLE(other)) : null,
    window: passes.windowStart && passes.windowEnd
      ? `${formatLocalDate(passes.windowStart)} ${formatLocalTime(passes.windowStart)} to ${formatLocalDate(passes.windowEnd)} ${formatLocalTime(passes.windowEnd)} Pacific`
      : "",
    note: `Visible means above ${passes.minElDeg ?? 10} deg, sunlit, and the sky dark enough (sun 6 deg or more below the horizon). Brightness not modeled.`,
    share: shareText(passes, now),
    stale: passes.windowEnd && new Date(passes.windowEnd).getTime() < now
      ? `This pass list ended ${formatLocalDate(passes.windowEnd)}; the next data refresh will replace it.`
      : null,
  };
}
