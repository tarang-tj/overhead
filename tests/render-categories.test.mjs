import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_KEYS, CATEGORY_HEX, CATEGORY_RGB, categoryOf, categoryIndex, filterMask } from "../web/render/categories.js";
import { colorFor } from "../web/render/sats.js";

test("category keys keep the frozen order and every key has a color", () => {
  assert.deepEqual(CATEGORY_KEYS, ["stations", "navigation", "weather", "earth", "science", "comms", "starlink", "leo", "other"]);
  assert.equal(CATEGORY_HEX.leo, "#f5a524");
  assert.equal(CATEGORY_HEX.other, "#6b7690");
});

test("hex table converts to 0..1 rgb", () => {
  assert.deepEqual(CATEGORY_RGB[0], [1, 1, 1]); // stations white
  const leo = CATEGORY_RGB[CATEGORY_KEYS.indexOf("leo")];
  assert.ok(Math.abs(leo[0] - 0xf5 / 255) < 1e-9 && Math.abs(leo[1] - 0xa5 / 255) < 1e-9 && Math.abs(leo[2] - 0x24 / 255) < 1e-9);
});

test("categoryOf: explicit category wins, then constellation, else other", () => {
  assert.equal(categoryOf({ category: "weather", constellation: "leo" }), "weather");
  assert.equal(categoryOf({ constellation: "leo" }), "leo");
  assert.equal(categoryOf({ category: "bogus", constellation: "starlink" }), "starlink");
  assert.equal(categoryOf({ category: "bogus" }), "other");
  assert.equal(categoryOf({ category: "toString" }), "other"); // prototype keys are not categories
  assert.equal(categoryOf({}), "other");
  assert.equal(categoryOf(null), "other");
  assert.equal(categoryIndex({ category: "navigation" }), 1);
});

test("colorFor returns each category's table color in constellation mode; unknown index falls back to other", () => {
  CATEGORY_KEYS.forEach((_, i) => assert.deepEqual(colorFor(i, 0, "constellation"), CATEGORY_RGB[i]));
  assert.deepEqual(colorFor(99, 0, "constellation"), CATEGORY_RGB[8]);
});

test("filterMask: null shows all, a list shows only those, unknown keys are ignored", () => {
  assert.deepEqual([...filterMask(null)], new Array(9).fill(1));
  assert.deepEqual([...filterMask(["stations", "leo", "nope"])], [1, 0, 0, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual([...filterMask([])], new Array(9).fill(0));
});
