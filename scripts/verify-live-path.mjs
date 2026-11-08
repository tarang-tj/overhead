// Prove the browser's LIVE data path end to end without spending a CelesTrak
// download: serve the site locally, answer the two CelesTrak GP requests with
// the real responses already cached in tools/cache (same URLs, real JSON, the
// CORS header CelesTrak sends), and assert the app boots in "live" mode with
// every satellite. Run: node scripts/verify-live-path.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { chromium } from "playwright";
import { createStaticServer, repoRoot } from "./static-server.mjs";

const gpUrl = (g) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=json`;
const cached = (url) => {
  const file = join(repoRoot, "tools", "cache", `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.json`);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return JSON.stringify(raw.data ?? raw);
};
const bodies = { kuiper: cached(gpUrl("kuiper")), starlink: cached(gpUrl("starlink")) };

const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const served = [];
  await page.route("https://celestrak.org/**", (route) => {
    const u = route.request().url();
    const g = u.includes("GROUP=kuiper") ? "kuiper" : u.includes("GROUP=starlink") ? "starlink" : null;
    if (!g) return route.fulfill({ status: 404, body: "" });
    served.push(g);
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: bodies[g] });
  });
  await page.goto(`${base}/?mode=orbit`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__oh?.ready === true, null, { timeout: 60000 });
  const meta = await page.evaluate(() => window.__oh.gpMeta);
  const badge = await page.evaluate(() => document.querySelector(".badge")?.textContent || "");
  assert.equal(meta.mode, "live", `expected live mode, got ${meta.mode}`);
  assert.ok(meta.count > 11000, `only ${meta.count} satellites`);
  assert.deepEqual(served.sort(), ["kuiper", "starlink"]);
  assert.match(badge, /CelesTrak/);
  // Reload: both groups must now come from the browser cache, with no new request.
  served.length = 0;
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__oh?.ready === true, null, { timeout: 60000 });
  const meta2 = await page.evaluate(() => window.__oh.gpMeta);
  assert.equal(meta2.mode, "cache");
  assert.equal(served.length, 0, "reload must not hit CelesTrak inside the 2 h cache window");
  assert.deepEqual(errors, []);
  console.log(`live path ok: ${meta.count} sats, badge "${badge}", reload served from cache (${meta2.mode})`);
} finally {
  await browser.close();
  server.close();
}
