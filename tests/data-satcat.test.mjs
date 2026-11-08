import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchSatcatRows } from "../tools/build-categories.mjs";
import { OWNERS, buildSatcatLite, parseCsv, unmappedOwners } from "../tools/lib/satcat-lite.mjs";

const real = JSON.parse(readFileSync(new URL("./fixtures/leo-satcat.json", import.meta.url), "utf8"));
const rows = [
  ...real.slice(0, 3),
  { NORAD_CAT_ID: 25544, OBJECT_ID: "1998-067A", OBJECT_TYPE: "PAY", OWNER: "ISS", LAUNCH_DATE: "1998-11-20", LAUNCH_SITE: "TTMTR", DECAY_DATE: null },
  { NORAD_CAT_ID: 99001, OBJECT_ID: "2024-001A", OBJECT_TYPE: "PAY", OWNER: "ZZZZ", LAUNCH_DATE: "2024-01-01", LAUNCH_SITE: "XSITE", DECAY_DATE: null },
  { NORAD_CAT_ID: 99002, OBJECT_ID: "2024-001B", OBJECT_TYPE: "R/B", OWNER: "US", LAUNCH_DATE: "2024-01-01", LAUNCH_SITE: "XSITE", DECAY_DATE: null },
];

test("satcat-lite shape: rows keyed by noradId as [owner, launchDate, site, intlDes]", () => {
  const lite = buildSatcatLite({ rows, activeIds: new Set([25544, 99001, real[0].NORAD_CAT_ID]), generatedAt: "t" });
  assert.deepEqual(Object.keys(lite), ["generatedAt", "owners", "rows"]);
  assert.deepEqual(lite.rows[25544], ["ISS", "1998-11-20", "TTMTR", "1998-067A"]);
  assert.deepEqual(lite.rows[real[0].NORAD_CAT_ID], [real[0].OWNER, real[0].LAUNCH_DATE, real[0].LAUNCH_SITE, real[0].OBJECT_ID]);
  assert.equal(Object.keys(lite.rows).length, 3);
  assert.equal(lite.owners.US, "United States");
  assert.ok(Object.keys(OWNERS).length >= 25);
});

test("unknown owner codes pass through raw and are reported", () => {
  const lite = buildSatcatLite({ rows, activeIds: new Set([99001]), generatedAt: "t" });
  assert.equal(lite.rows[99001][0], "ZZZZ");
  assert.equal(lite.owners.ZZZZ, undefined);
  assert.deepEqual(unmappedOwners(lite), ["ZZZZ"]);
});

test("without an active set only undecayed payloads are kept", () => {
  const lite = buildSatcatLite({ rows, generatedAt: "t" });
  // real[0] and real[1] are decayed; real[2] has an empty DECAY_DATE and is still up.
  assert.deepEqual(Object.keys(lite.rows).sort(), ["25544", String(real[2].NORAD_CAT_ID), "99001"].sort());
});

test("parseCsv handles quotes, commas, CRLF and empty cells", () => {
  const out = parseCsv('OBJECT_NAME,NORAD_CAT_ID,RCS\r\n"SAT, ONE ""X""",1,\r\nTWO,2,0.5\r\n');
  assert.deepEqual(out, [
    { OBJECT_NAME: 'SAT, ONE "X"', NORAD_CAT_ID: "1", RCS: null },
    { OBJECT_NAME: "TWO", NORAD_CAT_ID: "2", RCS: "0.5" },
  ]);
});

const mk = (handler) => { const calls = []; const f = async (u) => { calls.push(u); return handler(u); }; f.calls = calls; return f; };

test("falls back to satcat.csv when GROUP=active is unsupported, but not after a 403", async () => {
  const csv = "NORAD_CAT_ID,OWNER\n1,US\n";
  let cacheDir = await mkdtemp(join(tmpdir(), "sc-"));
  const f = mk((u) => (u.includes("records.php") ? { status: 400, text: async () => "bad" } : { status: 200, text: async () => csv }));
  const r = await fetchSatcatRows({ fetchOpts: { fetchImpl: f, cacheDir }, fetchImpl: f, log: () => {} });
  assert.equal(r.via, "satcat.csv");
  assert.equal(r.rows[0].OWNER, "US");

  cacheDir = await mkdtemp(join(tmpdir(), "sc-"));
  const g = mk(() => ({ status: 403, text: async () => "" }));
  await assert.rejects(fetchSatcatRows({ fetchOpts: { fetchImpl: g, cacheDir }, fetchImpl: g, log: () => {} }), /403/);
  assert.equal(g.calls.length, 1);
});
