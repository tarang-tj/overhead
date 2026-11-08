// NASA GIBS WMTS (EPSG:4326 "best") tile URLs, adapted from go-for-dock (MIT).
// Matrix sizes verified there against the 250m TileMatrixSet; GIBS reachable 2026-11-07.
export const TILE_MATRIX_250M = [
  { level: 0, width: 2, height: 1 }, { level: 1, width: 3, height: 2 }, { level: 2, width: 5, height: 3 },
  { level: 3, width: 10, height: 5 }, { level: 4, width: 20, height: 10 },
];
export const TILE_PX = 512;

const LAYERS = {
  VIIRS_NOAA20_CorrectedReflectance_TrueColor: { tileMatrixSet: "250m", ext: "jpg" },
  VIIRS_Black_Marble: { tileMatrixSet: "500m", ext: "png" },
};

export function tileUrl(layer, dateStr, level, row, col) {
  const cfg = LAYERS[layer];
  if (!cfg) throw new Error(`gibs: unknown layer "${layer}"`);
  return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${dateStr}/${cfg.tileMatrixSet}/${level}/${row}/${col}.${cfg.ext}`;
}

/** GIBS imagery is "yesterday UTC": today's swath is often partial. */
export function yesterdayUtc(now = new Date()) {
  return new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
}
