import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { refresh } from "../tools/build-all.mjs";

const gp = readFileSync(new URL("./fixtures/leo-gp.json", import.meta.url), "utf8");
const satcat = readFileSync(new URL("./fixtures/leo-satcat.json", import.meta.url), "utf8");
const NAMES = ["active", "kuiper", "starlink", "stations", "gnss", "weather"];

/** Serves fixtures; any URL containing `blockOn` gets `blockStatus`. Unknown groups 404. */
function stub({ blockOn = null, blockStatus = 403 } = {}) {
  const calls = [];
  const f = async (u) => {
    calls.push(u);
    if (blockOn && u.includes(blockOn)) return { status: blockStatus, text: async () => "" };
    if (u.includes("records.php")) return { status: 200, text: async () => satcat };
    const g = /GROUP=([^&]+)/.exec(u)?.[1];
    return NAMES.includes(g) ? { status: 200, text: async () => gp } : { status: 404, text: async () => "" };
  };
  f.calls = calls;
  return f;
}

async function setup() {
  const outDir = await mkdtemp(join(tmpdir(), "out-"));
  const cacheDir = await mkdtemp(join(tmpdir(), "cache-"));
  const sentinel = { "categories.json": "OLD-CATS", "gp-snapshot.json": "OLD-SNAP", "satcat-lite.json": "OLD-SC", "line.json": "OLD-LINE", "passes.json": "OLD-PASS", "horizon.json": "OLD-HZ" };
  for (const [n, t] of Object.entries(sentinel)) await writeFile(join(outDir, n), t);
  return { outDir, cacheDir, sentinel };
}
const same = async (outDir, sentinel) => {
  assert.deepEqual((await readdir(outDir)).sort(), Object.keys(sentinel).sort(), "no stray or temp files");
  for (const [n, t] of Object.entries(sentinel)) assert.equal(await readFile(join(outDir, n), "utf8"), t, n);
};

for (const status of [403, 429]) {
  test(`a ${status} on a category group mid-run leaves web/data untouched`, async () => {
    const { outDir, cacheDir, sentinel } = await setup();
    const f = stub({ blockOn: "GROUP=gnss", blockStatus: status });
    await assert.rejects(refresh({ outDir, fetchOpts: { fetchImpl: f, cacheDir }, log: () => {} }), new RegExp(String(status)));
    assert.ok(f.calls.some((u) => u.includes("GROUP=stations")), "the block was actually hit");
    await same(outDir, sentinel);
  });
}

test("a 403 on SATCAT after categories succeeded still writes nothing", async () => {
  const { outDir, cacheDir, sentinel } = await setup();
  const f = stub({ blockOn: "GROUP=active&FORMAT=json" });
  const g = async (u) => (u.includes("records.php?GROUP=active") ? { status: 403, text: async () => "" } : f(u));
  await assert.rejects(refresh({ outDir, fetchOpts: { fetchImpl: g, cacheDir }, log: () => {} }), /403/);
  await same(outDir, sentinel);
});

test("a fully successful run writes every file, with no temp files left", async () => {
  const { outDir, cacheDir } = await setup();
  const f = stub();
  const files = await refresh({ outDir, fetchOpts: { fetchImpl: f, cacheDir }, log: () => {} });
  const names = (await readdir(outDir)).sort();
  assert.deepEqual(names, ["categories.json", "gp-snapshot.json", "horizon.json", "line.json", "passes.json", "satcat-lite.json"]);
  assert.ok(!names.some((n) => n.endsWith(".tmp")));
  assert.equal(await readFile(join(outDir, "horizon.json"), "utf8"), "OLD-HZ");
  const cats = JSON.parse(await readFile(join(outDir, "categories.json"), "utf8"));
  // The stub serves the same rows for every group, so leo (highest priority) wins them all.
  assert.ok(cats.byCategory.leo.length > 0);
  assert.equal(cats.groups.stations, "stations");
  assert.ok(files["gp-snapshot.json"].length > 0);
});
