// Category keys and colors (interfaces-v2.md). Fixed order, used everywhere.
export const CATEGORY_KEYS = ["stations", "navigation", "weather", "earth", "science", "comms", "starlink", "leo", "other"];
export const CATEGORY_HEX = {
  stations: "#ffffff", navigation: "#c9a0ff", weather: "#5fd3e0", earth: "#7fd6a0", science: "#ff9ecb",
  comms: "#9aa8c2", starlink: "#9ec5ff", leo: "#f5a524", other: "#6b7690",
};
export const CAT_INDEX = Object.freeze(Object.fromEntries(CATEGORY_KEYS.map((k, i) => [k, i])));
export const IDX_STARLINK = CAT_INDEX.starlink;
export const IDX_LEO = CAT_INDEX.leo;

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const CATEGORY_RGB = CATEGORY_KEYS.map((k) => hexRgb(CATEGORY_HEX[k]));

/** Category key for a sat record: its own `category`, else constellation leo/starlink, else "other". */
export function categoryOf(sat) {
  const c = sat && sat.category;
  if (typeof c === "string" && Object.hasOwn(CAT_INDEX, c)) return c;
  const k = sat && sat.constellation;
  return k === "leo" || k === "starlink" ? k : "other";
}

export const categoryIndex = (sat) => CAT_INDEX[categoryOf(sat)];

/** Keys -> Uint8Array mask over category indices (1 = shown). null/undefined shows all; unknown keys are ignored. */
export function filterMask(keys) {
  const m = new Uint8Array(CATEGORY_KEYS.length).fill(keys == null ? 1 : 0);
  if (keys != null) for (const k of keys) if (Object.hasOwn(CAT_INDEX, k)) m[CAT_INDEX[k]] = 1;
  return m;
}
