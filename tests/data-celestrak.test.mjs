import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { USER_AGENT, fetchCelestrak, gpUrl } from "../tools/lib/celestrak.mjs";

const url = gpUrl("kuiper");
const mkFetch = (status, body = "[]") => {
  const calls = [];
  const f = async (u, init) => { calls.push({ u, init }); return { status, text: async () => body }; };
  f.calls = calls;
  return f;
};

test("stops on a non-200 without retrying or caching", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ck-"));
  const f = mkFetch(403, "");
  await assert.rejects(fetchCelestrak(url, { fetchImpl: f, cacheDir: dir }), /403/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(await readdir(dir), []);
});

test("caches a 200 for the TTL, then refetches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ck-"));
  const f = mkFetch(200, '[{"a":1}]');
  const t0 = Date.parse("2026-11-07T00:00:00Z");
  const first = await fetchCelestrak(url, { fetchImpl: f, cacheDir: dir, now: t0 });
  const second = await fetchCelestrak(url, { fetchImpl: f, cacheDir: dir, now: t0 + 3600e3 });
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(f.calls.length, 1);
  await fetchCelestrak(url, { fetchImpl: f, cacheDir: dir, now: t0 + 2.1 * 3600e3 });
  assert.equal(f.calls.length, 2);
});

test("sends the identifying User-Agent and rejects non-array bodies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ck-"));
  const f = mkFetch(200, '{"error":"x"}');
  await assert.rejects(fetchCelestrak(url, { fetchImpl: f, cacheDir: dir }), /non-array/);
  assert.equal(f.calls[0].init.headers["User-Agent"], USER_AGENT);
});
