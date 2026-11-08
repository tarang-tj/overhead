// Drive the Look Up compass path in a real (headless) mobile browser with
// synthetic iOS-style orientation events: permission button -> event ->
// look-model -> onLook -> renderer camera and the on-screen readout.
// Hardware sensor accuracy is the only thing this cannot cover.
// Run: node scripts/verify-compass.mjs
import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright";
import { createStaticServer } from "./static-server.mjs";

const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://celestrak.org/**", (r) => r.fulfill({ status: 503, body: "" }));
  // Pretend to be iOS Safari: requestPermission exists and resolves "granted".
  await page.addInitScript(() => {
    window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {};
    window.DeviceOrientationEvent.requestPermission = async () => "granted";
  });
  await page.goto(`${base}/?mode=lookup`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__oh?.ready === true, null, { timeout: 60000 });
  await page.getByRole("button", { name: /phone compass/i }).click();

  // Phone held upright (beta 90), screen facing the user, camera pointing at the
  // compass heading. iOS reports webkitCompassHeading relative to magnetic north.
  const fire = (heading, beta) => page.evaluate(([h, b]) => {
    const e = new Event("deviceorientation");
    Object.assign(e, { alpha: (360 - h) % 360, beta: b, gamma: 0, absolute: false, webkitCompassHeading: h, webkitCompassAccuracy: 10 });
    window.dispatchEvent(e);
  }, [heading, beta]);

  const results = [];
  for (const [heading, beta] of [[0, 90], [90, 90], [180, 120], [270, 60]]) {
    await fire(heading, beta);
    await page.waitForTimeout(250);
    const readout = await page.evaluate(() => document.getElementById("ui-root").innerText.match(/Facing [^\n]*/)?.[0] || "");
    results.push({ heading, beta, readout });
  }
  console.log(JSON.stringify(results, null, 1));
  // Readout must change with heading, and pitch must rise when the phone tilts back.
  const az = results.map((r) => Number(r.readout.match(/(\d+) deg/)?.[1]));
  assert.equal(new Set(az).size, 4, `azimuth did not track the heading: ${az}`);
  for (let i = 0; i < 4; i++) {
    const expected = (results[i].heading + 15) % 360; // magnetic -> true, +15 deg declination at Bothell
    const diff = Math.abs(((az[i] - expected + 540) % 360) - 180);
    assert.ok(diff <= 2, `heading ${results[i].heading}: readout ${az[i]} vs expected ${expected}`);
  }
  assert.match(results[2].readout, /up (2[5-9]|3\d) deg/, "tilting back 30 deg should read about 30 deg up");
  assert.deepEqual(errors, []);
  console.log("compass path ok");
} finally {
  await browser.close();
  server.close();
}
