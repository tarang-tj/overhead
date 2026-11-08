import { test } from "node:test";
import assert from "node:assert/strict";
import { stageCodes, colorFor, LEO_RGB, STARLINK_RGB } from "../web/render/sats.js";
import { writeTail, TRAIL_SECONDS } from "../web/render/trails.js";
import { CAT_INDEX } from "../web/render/categories.js";

const LEO = CAT_INDEX.leo, SL = CAT_INDEX.starlink;

const sats = [101, 102, 103, 104].map((id, i) => ({ noradId: id, constellation: i % 2 ? "starlink" : "leo" }));
const line = { constellations: { leo: { stageIds: { raising: [101], descending: [] } }, starlink: { stageIds: { raising: [], descending: [102] } } } };

test("stageCodes maps raising=1, descending=2, everything else on station (0)", () => {
  assert.deepEqual([...stageCodes(sats, line)], [1, 2, 0, 0]);
  assert.deepEqual([...stageCodes(sats, null)], [0, 0, 0, 0]);
  assert.deepEqual([...stageCodes(sats, { constellations: { leo: {} } })], [0, 0, 0, 0]);
});

test("colorFor: constellation mode ignores stage; stage mode paints raising green, descending red, on station dimmed", () => {
  assert.deepEqual(colorFor(LEO, 1, "constellation"), LEO_RGB);
  assert.deepEqual(colorFor(SL, 2, "constellation"), STARLINK_RGB);
  const g = colorFor(SL, 1, "stage"), r = colorFor(LEO, 2, "stage"), dim = colorFor(SL, 0, "stage");
  assert.ok(g[1] > g[0] && g[1] > g[2], "raising is green");
  assert.ok(r[0] > r[1] && r[0] > r[2], "descending is red");
  assert.ok(dim[0] < STARLINK_RGB[0] && dim[2] < STARLINK_RGB[2] && dim[2] > 0.5 * STARLINK_RGB[2], "on station keeps its hue, slightly dimmer");
});

test("colorFor stage mode pushes non-constellation categories back", () => {
  const navi = colorFor(CAT_INDEX.navigation, 0, "stage"), plain = colorFor(CAT_INDEX.navigation, 0, "constellation");
  assert.ok(navi.every((v, i) => v < plain[i]));
});

test("writeTail runs backward along the velocity, TRAIL_SECONDS long, fading to zero", () => {
  const segs = 8, pos = new Float32Array(segs * 2 * 3), alpha = new Float32Array(segs * 2);
  const end = writeTail(pos, alpha, 0, { x: 7000, y: 0, z: 0 }, { x: 0, y: 7.5, z: 0 }, 1);
  assert.equal(end, segs * 2);
  assert.equal(pos[1], 0); // first vertex is the head
  assert.ok(Math.abs(pos[(segs * 2 - 1) * 3 + 1] + 7.5 * TRAIL_SECONDS) < 1e-3); // last vertex is TRAIL_SECONDS back
  assert.equal(alpha[0], 1);
  assert.ok(Math.abs(alpha[segs * 2 - 1]) < 1e-9);
  for (let v = 1; v < segs * 2; v++) assert.ok(alpha[v] <= alpha[v - 1] + 1e-9, "alpha never increases");
});
