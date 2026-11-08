// Drive the v2 interactions in a real browser with real imagery (CelesTrak
// blocked, snapshot data): search + card, What's that light, time travel and
// geolocation. Writes artifacts/v2-*.png. Not part of the gate.
// Usage: node scripts/capture-v2.mjs   (PHONE=1 for 390x844)
import { once } from "node:events";
import { join } from "node:path";
import { chromium } from "playwright";
import { createStaticServer, repoRoot } from "./static-server.mjs";

const out = (n) => join(repoRoot, "artifacts", `v2-${process.env.PHONE === "1" ? "phone-" : ""}${n}.png`);
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const phone = process.env.PHONE === "1";
const context = await browser.newContext({
  ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } }),
  geolocation: { latitude: 51.5007, longitude: -0.1246 }, permissions: ["geolocation"],
});
const page = await context.newPage();
const notes = [];
page.on("pageerror", (e) => notes.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") notes.push(`console error: ${m.text().slice(0, 160)}`); });
await page.route("**/celestrak.org/**", (r) => r.fulfill({ status: 503, body: "" }));
await page.goto(`${base}/?mode=orbit`, { waitUntil: "load" });
await page.waitForFunction(() => window.__oh?.ready, null, { timeout: 90000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: out("orbit") });

const search = page.getByRole("combobox").or(page.getByPlaceholder(/search/i)).first();
await search.click();
await search.fill("ISS");
await page.waitForTimeout(600);
await page.screenshot({ path: out("search") });
await search.press("Enter");
await page.waitForTimeout(2500);
await page.screenshot({ path: out("card-iss") });
notes.push(`card text: ${(await page.locator("#ui-root").innerText()).match(/ISS[\s\S]{0,400}/)?.[0]?.replace(/\n/g, " | ")}`);

await page.evaluate(() => window.__oh.setMode("lookup"));
await page.waitForTimeout(800);
await page.evaluate(() => window.__oh.explore.onLook(200, 45, null));
await page.waitForTimeout(1500);
const ident = page.getByRole("button", { name: /what's that light/i });
if (await ident.count()) { await ident.first().click(); await page.waitForTimeout(800); }
await page.screenshot({ path: out("identify") });

await page.evaluate(() => { window.__oh.explore.onTime(new Date(Date.now() + 6 * 3600e3)); window.__oh.ui.setSimTime?.(new Date(Date.now() + 6 * 3600e3)); });
await page.waitForTimeout(2500);
await page.screenshot({ path: out("lookup-plus6h") });

const loc = page.getByRole("button", { name: /my location|use my location|location/i });
if (await loc.count()) { await loc.first().click(); await page.waitForTimeout(2500); }
await page.screenshot({ path: out("lookup-london") });
notes.push(`header: ${(await page.locator("#ui-root").innerText()).split("\n").slice(0, 6).join(" | ")}`);
console.log(notes.join("\n") || "no notes");
await browser.close();
server.close();
