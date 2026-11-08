// Visual check with real imagery (NASA GIBS, USGS tiles) but CelesTrak
// blocked, so it boots on the saved snapshot without spending a download.
// Writes artifacts/real-*.png for a human look. Not part of the gate.
import { once } from "node:events";
import { join } from "node:path";
import { chromium } from "playwright";
import { createStaticServer, repoRoot } from "./static-server.mjs";

const out = join(repoRoot, "artifacts");
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const phone = process.env.PHONE === "1";
const page = await browser.newPage(phone ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
const tag = phone ? "phone-" : "";
const notes = [];
page.on("pageerror", (e) => notes.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) notes.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
await page.route("**/celestrak.org/**", (r) => r.fulfill({ status: 503, body: "" }));
await page.goto(`${base}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__oh?.ready, null, { timeout: 60000 });
let last = 0;
for (const t of [1500, 3500, 4500, 5500, 8000, 11000, 14500]) {
  await page.waitForTimeout(t - last);
  last = t;
  await page.screenshot({ path: join(out, `real-${tag}zoom-${t}.png`) });
}
await page.evaluate(() => window.__oh.setMode("lookup"));
await page.waitForTimeout(800);
await page.evaluate(() => window.__oh.renderer.setLook(162, 8, 12));
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, `real-${tag}lookup-rainier.png`) });
await page.evaluate(() => window.__oh.renderer.setLook(200, 60, null));
await page.waitForTimeout(2000);
await page.screenshot({ path: join(out, `real-${tag}lookup-high.png`) });
await page.evaluate(() => window.__oh.setMode("line"));
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, `real-${tag}line.png`) });
await page.evaluate(() => window.__oh.setMode("orbit"));
await page.waitForTimeout(800);
await page.evaluate(() => fetch('web/data/passes.json').then((r) => r.json()).then((p) => window.__oh.renderer.highlight(p.passes[0].noradId)));
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, `real-${tag}orbit-highlight.png`) });
await page.evaluate(() => { window.__oh.setMode("orbit"); window.__oh.renderer.highlight(null); window.__oh.renderer.setColorMode("stage"); });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, `real-${tag}orbit-stage.png`) });
await page.evaluate(() => window.__oh.setMode("tonight"));
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, `real-${tag}tonight.png`) });
console.log(notes.slice(0, 20).join("\n") || "no warnings");
await browser.close();
server.close();
