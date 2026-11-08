// Smoke-check the deployed site like a real visitor: live CelesTrak data,
// no page errors, canvas painted. Usage: node scripts/check-live.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] || "https://tarang-tj.github.io/overhead/?mode=orbit";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.__oh?.ready === true, null, { timeout: 90000 });
await page.waitForTimeout(4000);
const result = await page.evaluate(() => ({ meta: window.__oh.gpMeta, lit: window.__oh.litFraction(), stats: window.__oh.renderer?.stats() }));
await page.screenshot({ path: "artifacts/live-orbit.png" });
console.log(JSON.stringify(result));
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
