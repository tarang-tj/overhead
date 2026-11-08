// Shared tile fetch + mosaic helpers (browser). Never throws: warns and returns null.
export async function loadTileImage(url, timeoutMs = 8000) {
  try {
    const res = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await createImageBitmap(await res.blob());
  } catch (err) {
    console.warn(`[tiles] load failed, using fallback fill: ${url} (${err?.message || err})`);
    return null;
  }
}

export function makeCanvas(w, h, fill) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  return c;
}
