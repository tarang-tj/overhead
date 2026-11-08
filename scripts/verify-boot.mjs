// Boot probe (tycho / go-for-dock pattern): serve the repo, open it in
// headless Chromium (SwiftShader), block every third party except the pinned
// jsdelivr modules, and assert the app boots on its saved snapshot:
// no uncaught errors or console errors, canvas painted, thousands of
// satellites loaded, and every mode (zoom, orbit, line, lookup, tonight)
// renders its panel. Screenshots land in artifacts/boot-*.png for a human look.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { chromium } from "playwright";
import { createStaticServer, repoRoot } from "./static-server.mjs";

const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const outDir = join(repoRoot, "artifacts");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.stack || e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  // Third parties (CelesTrak, GIBS, USGS tiles) answer an empty 200 so the
  // app must take its offline paths without Chromium logging load errors.
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith("https://cdn.jsdelivr.net/")) return route.continue();
    if (u.startsWith(base)) {
      const rel = decodeURIComponent(new URL(u).pathname).replace(/^\/+/, "");
      if (rel === "" || existsSync(join(repoRoot, rel))) return route.continue();
    }
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });

  await page.goto(`${base}/?mode=orbit`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__oh?.ready === true, null, { timeout: 60000 });
  const meta = await page.evaluate(() => window.__oh.gpMeta);
  assert.equal(meta.mode, "snapshot", `expected the offline snapshot, got ${meta.mode}`);
  assert.ok(meta.count > 1000, `only ${meta.count} satellites loaded`);
  await page.waitForTimeout(3000);
  const lit = await page.evaluate(() => window.__oh.litFraction());
  assert.ok(lit > 0.01, `canvas looks unpainted (lit fraction ${lit})`);
  // The canvas must fill the viewport on a dark page (caught a 300x150 default canvas on white once).
  const layout = await page.evaluate(() => {
    const c = document.getElementById("scene");
    const bg = getComputedStyle(document.body).backgroundColor;
    return { w: c.clientWidth, h: c.clientHeight, vw: innerWidth, vh: innerHeight, bg };
  });
  assert.ok(layout.w >= layout.vw * 0.95 && layout.h >= layout.vh * 0.95, `canvas does not fill the viewport: ${JSON.stringify(layout)}`);
  assert.notEqual(layout.bg, "rgb(255, 255, 255)", "page background is white");
  // The stats line must report the propagated fleet, not zeros.
  const statsText = await page.evaluate(() => document.getElementById("ui-root").innerText);
  assert.doesNotMatch(statsText, /\b0 satellites tracked/, "UI stats never updated from the renderer");
  await page.screenshot({ path: join(outDir, "boot-orbit.png") });

  const modes = [
    ["line", /Amazon Leo/],
    ["lookup", /(Facing|Look)/i],
    ["tonight", /(pass|Tonight)/i],
  ];
  for (const [mode, pattern] of modes) {
    await page.evaluate((m) => window.__oh.setMode(m), mode);
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.getElementById("ui-root").innerText);
    assert.match(text, pattern, `${mode} panel text missing`);
    await page.screenshot({ path: join(outDir, `boot-${mode}.png`) });
  }

  // Intro zoom: fresh load without ?mode, capture mid-flight and confirm it hands off to orbit.
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__oh?.ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(outDir, "boot-zoom-start.png") });
  await page.waitForFunction(() => window.__oh.mode === "orbit", null, { timeout: 40000 });
  await page.screenshot({ path: join(outDir, "boot-zoom-end.png") });

  const stats = await page.evaluate(() => window.__oh.renderer?.stats());
  console.log(`boot ok: ${meta.count} sats (${meta.mode}), lit ${lit.toFixed(3)}, stats ${JSON.stringify(stats)}`);
  assert.deepEqual(errors, [], `errors during boot:\n${errors.join("\n")}`);
} finally {
  await browser.close();
  server.close();
}
