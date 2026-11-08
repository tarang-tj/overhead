// Pure models for the satellite card and the "What's that light?" list. No DOM.
import { formatShortDate, formatLocalTime } from "./format.js";
import { directionText } from "./tonight-model.js";

export const LAUNCH_SITES = {
  AFETR: "Cape Canaveral", AFWTR: "Vandenberg", FRGUI: "Kourou", TTMTR: "Baikonur", JSC: "Jiuquan",
  TSC: "Taiyuan", XSC: "Xichang", WSC: "Wenchang", SRILR: "Sriharikota", TNSTA: "Tanegashima",
  KYMSC: "Kapustin Yar", PLMSC: "Plesetsk", VOSTO: "Vostochny", RLLB: "Mahia (Rocket Lab)", STARB: "Starbase",
  // Codes seen in the real SATCAT on 2026-11-08 (TYMSC is how SATCAT spells Baikonur).
  TYMSC: "Baikonur", TAISC: "Taiyuan", XICLF: "Xichang", TANSC: "Tanegashima", KSCUT: "Uchinoura",
  DLS: "Dombarovsky", NSC: "Naro (South Korea)", YSLA: "Yellow Sea launch area", SCSLA: "South China Sea launch area",
  SEAL: "Sea Launch", ERAS: "Air launch, Eastern Range", WRAS: "Air launch, Western Range", WLPIS: "Wallops Island",
  KODAK: "Kodiak", ANDSP: "Andoya", SEMLS: "Semnan", SMTS: "Shahrud", YUN: "Sohae (North Korea)",
};
export const NO_PASS = "No pass in the next 48 h";
export const NO_FACING = "Nothing within 5 deg of where you are facing.";
export const BUILT_NEAR_KM = "about 10 km";

export const siteName = (code) => (code ? LAUNCH_SITES[code] || String(code) : null);

/** "47.7 deg N, 122.2 deg W". */
export function formatLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `${Math.abs(lat).toFixed(1)} deg ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(1)} deg ${lon < 0 ? "W" : "E"}`;
}

/** "Jun 12, 2019" from a YYYY-MM-DD string, read as UTC so the day never shifts. */
export function formatLaunchDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  if (!s || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const lightText = (sunlit) => (sunlit ? "sunlit" : "in Earth's shadow");

/** undefined means the pass lookup failed; null means there is none. */
export function nextPassText(p) {
  if (p === undefined) return "Next pass unavailable";
  if (!p) return NO_PASS;
  const when = `${formatShortDate(p.visibleStart || p.start)}, ${formatLocalTime(p.visibleStart || p.start)}`;
  return `${when}: ${directionText(p)}. ${p.visible ? "You could see it" : "Not visible (daylight or shadow)"}`;
}

export function builtNearText(category, city) {
  if (!city || (category !== "leo" && category !== "starlink")) return null;
  return `Built in ${city}, ${BUILT_NEAR_KM} from UW Bothell`;
}

/** Card model from satIndex entry (fallback name) and getSatInfo result. rows are [label, value]. */
export function cardModel(entry, info, categories = []) {
  const category = info?.category ?? entry?.category ?? "other";
  const cat = categories.find((c) => c.key === category);
  const st = info?.state || null;
  const rows = [];
  const add = (k, v) => { if (v !== null && v !== undefined && v !== "") rows.push([k, v]); };
  add("Owner", info?.ownerName);
  const site = siteName(info?.launchSite);
  const date = formatLaunchDate(info?.launchDate);
  add("Launched", [date, site && `from ${site}`].filter(Boolean).join(" ") || null);
  if (st) {
    add("Altitude", Number.isFinite(st.altKm) ? `${Math.round(st.altKm).toLocaleString("en-US")} km` : null);
    add("Speed", Number.isFinite(st.speedKmS) ? `${st.speedKmS.toFixed(1)} km/s` : null);
    add("Over", formatLatLon(st.latDeg, st.lonDeg));
    if (Number.isFinite(st.azDeg) && Number.isFinite(st.elDeg)) {
      add("From you", `${st.elDeg < 0 ? "Below the horizon" : `${Math.round(st.elDeg)} deg up`}, azimuth ${Math.round(st.azDeg)} deg, ${lightText(st.sunlit)}`);
    }
  }
  add("Next pass", nextPassText(info?.nextPass));
  add("Built", builtNearText(category, info?.builtNearUwb));
  return {
    noradId: entry?.noradId ?? info?.noradId ?? null,
    name: info?.name || entry?.name || "Unknown satellite",
    intlDes: info?.intlDes || null,
    chip: cat?.label || category,
    color: cat?.color || null,
    rows,
    sky: st && Number.isFinite(st.azDeg) && Number.isFinite(st.elDeg) && st.elDeg >= 0 ? { az: st.azDeg, el: st.elDeg } : null,
  };
}

/** List model for identify results. */
export function identifyModel(results, nameOf, categoryOf, categories = []) {
  const rows = (results || []).map((r) => {
    const category = categoryOf?.(r.noradId) ?? "other";
    const cat = categories.find((c) => c.key === category);
    const sep = Math.round(r.sepDeg);
    return {
      noradId: r.noradId,
      name: nameOf?.(r.noradId) || `NORAD ${r.noradId}`,
      chip: cat?.label || category,
      color: cat?.color || null,
      sep: sep < 1 ? "under 1 deg away" : `${sep} deg away`,
      light: lightText(r.sunlit),
    };
  });
  return { rows, empty: rows.length ? null : NO_FACING };
}
