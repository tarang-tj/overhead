import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchCategoryGroups } from "../tools/build-categories.mjs";
import { CATEGORY_KEYS, GROUP_CATEGORY, PRIORITY, buildCategories, pickCategory } from "../tools/lib/categories.mjs";

test("group mapping follows interfaces-v2 and only yields known category keys", () => {
  assert.equal(GROUP_CATEGORY.kuiper, "leo");
  assert.equal(GROUP_CATEGORY.starlink, "starlink");
  assert.equal(GROUP_CATEGORY.stations, "stations");
  assert.equal(GROUP_CATEGORY["gps-ops"], "navigation");
  assert.equal(GROUP_CATEGORY.noaa, "weather");
  assert.equal(GROUP_CATEGORY.tdrss, "comms");
  assert.equal(GROUP_CATEGORY.argos, "earth");
  assert.equal(GROUP_CATEGORY.sarsat, "earth");
  assert.equal(GROUP_CATEGORY.military, "other");
  for (const c of Object.values(GROUP_CATEGORY)) assert.ok(CATEGORY_KEYS.includes(c), c);
  assert.deepEqual([...PRIORITY].sort(), [...CATEGORY_KEYS].sort());
});

test("priority: leo > starlink > stations > navigation > weather > earth > science > comms > other", () => {
  assert.equal(pickCategory(["geo", "science"]), "science");
  assert.equal(pickCategory(["geo", "stations", "science"]), "stations");
  assert.equal(pickCategory(["starlink", "kuiper"]), "leo");
  assert.equal(pickCategory(["comms-unknown", "military"]), "other");
  assert.equal(pickCategory(["resource", "weather"]), "weather");
  assert.equal(pickCategory([]), "other");
});

test("categories.json has the exact interface shape, filters to active ids and omits other", () => {
  const { json, categoryByNorad } = buildCategories({
    membership: { stations: [25544, 48274], science: [25544, 20580], geo: [10, 11], military: [12], kuiper: [63724] },
    activeIds: new Set([25544, 48274, 20580, 10, 12, 63724]),
    generatedAt: "2026-11-08T00:00:00.000Z", source: "src",
  });
  assert.deepEqual(Object.keys(json), ["generatedAt", "source", "groups", "byCategory"]);
  assert.equal(json.groups.kuiper, "leo");
  assert.deepEqual(json.byCategory.stations, [25544, 48274]);
  assert.deepEqual(json.byCategory.science, [20580]);
  assert.deepEqual(json.byCategory.comms, [10]);
  assert.deepEqual(json.byCategory.leo, [63724]);
  assert.ok(!("other" in json.byCategory));
  assert.equal(categoryByNorad.get(12), "other");
  assert.equal(categoryByNorad.has(11), false, "inactive id ignored");
  for (const ids of Object.values(json.byCategory)) for (const id of ids) assert.ok(Number.isInteger(id));
});

const stub = (map) => {
  const calls = [];
  const f = async (u) => {
    calls.push(u);
    const hit = Object.entries(map).find(([k]) => u.includes(`GROUP=${k}&`));
    const [status, body] = hit ? hit[1] : [404, "Not found"];
    return { status, text: async () => body };
  };
  f.calls = calls;
  return f;
};

test("a missing or empty group is skipped and logged, others still load", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "cat-"));
  const f = stub({ stations: [200, '[{"NORAD_CAT_ID":25544}]'], weather: [200, "[]"] });
  const logs = [];
  const r = await fetchCategoryGroups({ groups: ["stations", "weather", "nosuch"], fetchOpts: { fetchImpl: f, cacheDir }, log: (m) => logs.push(m) });
  assert.deepEqual(r.membership, { stations: [25544] });
  assert.deepEqual(r.skipped.map((s) => s.group), ["weather", "nosuch"]);
  assert.equal(logs.length, 2);
  assert.equal(f.calls.length, 3);
});

test("a 403 stops fetching the remaining groups", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "cat-"));
  const f = stub({ stations: [403, ""] });
  const r = await fetchCategoryGroups({ groups: ["stations", "weather", "goes"], fetchOpts: { fetchImpl: f, cacheDir }, log: () => {} });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(r.membership, {});
});
