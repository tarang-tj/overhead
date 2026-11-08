import test from "node:test";
import assert from "node:assert/strict";
import {
  headerText, observerFromPosition, locationErrorText, searchSats, notableChips, legendModel, toggleFilter,
  DEFAULT_CATEGORIES, LOCATION_ERROR,
} from "../web/ui/explore-model.js";
import { offsetToDate, dateToOffset, offsetText, timeLabel, accuracyWarning } from "../web/ui/time-model.js";
import { isTap } from "../web/ui/look-model.js";
import { cardModel, formatLatLon, formatLaunchDate, siteName, nextPassText, builtNearText, identifyModel, NO_PASS, NO_FACING } from "../web/ui/card-model.js";

const idx = [
  { noradId: 25544, name: "ISS (ZARYA)", category: "stations" },
  { noradId: 20580, name: "HST", category: "science" },
  { noradId: 43013, name: "NOAA 20", category: "weather" },
  { noradId: 44713, name: "STARLINK-1007", category: "starlink" },
  { noradId: 25, name: "ZARYA TEST", category: "other" },
  { noradId: 2554, name: "OTHER 2554", category: "other" },
];

test("header counts sum categories and use seeableNow", () => {
  assert.equal(headerText({ aboveHorizonByCategory: { leo: 3, other: 9 }, seeableNow: 2 }), "Above UW Bothell now: 12 satellites, 2 sunlit in a dark sky");
  assert.equal(headerText({ aboveHorizonByCategory: { other: 1 }, seeableNow: 0 }, { you: true }), "Above you now: 1 satellite, 0 sunlit in a dark sky");
  const now = Date.parse("2026-11-08T10:14:30Z");
  assert.equal(headerText({ aboveHorizonByCategory: { other: 2 }, seeableNow: 1 }, { simDate: new Date(now + 30000), now }), "Above UW Bothell now: 2 satellites, 1 sunlit in a dark sky");
  assert.equal(headerText({ aboveHorizonByCategory: { other: 2 }, seeableNow: 1 }, { simDate: new Date(now + 3 * 3600000), now }), "Above UW Bothell at 5:14 AM: 2 satellites, 1 sunlit in a dark sky");
  assert.equal(headerText({ propagated: 0, aboveHorizonByCategory: {}, seeableNow: 0 }), "Loading satellites...");
  assert.equal(headerText({ propagated: 5 }), null);
  assert.equal(headerText(null), null);
});

test("location: observer from position and the one error copy", () => {
  assert.deepEqual(observerFromPosition({ coords: { latitude: 47.7, longitude: -122.2, altitude: 120 } }),
    { name: "Your location", latDeg: 47.7, lonDeg: -122.2, heightKm: 0.12 });
  assert.equal(observerFromPosition({ coords: { latitude: 1, longitude: 2, altitude: null } }).heightKm, 0);
  assert.equal(observerFromPosition({ coords: { latitude: 95, longitude: 2 } }), null);
  assert.equal(observerFromPosition(null), null);
  assert.equal(locationErrorText(), "Location unavailable, showing UW Bothell");
  assert.equal(LOCATION_ERROR, locationErrorText());
});

test("search ranks exact id, name prefix, id prefix, contains; caps at 8", () => {
  assert.deepEqual(searchSats(idx, "25544").map((s) => s.noradId), [25544]);
  assert.deepEqual(searchSats(idx, "255").map((s) => s.noradId), [2554, 25544]); // id prefix; shorter name first
  assert.equal(searchSats(idx, "zarya")[0].name, "ZARYA TEST"); // name prefix beats contains
  assert.equal(searchSats(idx, "zarya")[1].name, "ISS (ZARYA)");
  assert.equal(searchSats(idx, "NOAA 20")[0].noradId, 43013);
  assert.deepEqual(searchSats(idx, "  "), []);
  assert.deepEqual(searchSats(idx, "nomatch"), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ noradId: 1000 + i, name: `STARLINK-${i}`, category: "starlink" }));
  assert.equal(searchSats(many, "starlink").length, 8);
});

test("notable chips only when the id is in the index", () => {
  assert.deepEqual(notableChips(idx).map((c) => c.label), ["ISS", "Hubble", "NOAA 20"]);
  assert.deepEqual(notableChips([]), []);
});

test("legend counts and filter toggling", () => {
  const keys = DEFAULT_CATEGORIES.map((c) => c.key);
  const m = legendModel(DEFAULT_CATEGORIES, { leo: 4 }, ["leo"]);
  assert.equal(m.allPressed, false);
  assert.equal(m.chips.find((c) => c.key === "leo").count, 4);
  assert.equal(m.chips.find((c) => c.key === "leo").pressed, true);
  assert.equal(m.chips.find((c) => c.key === "other").count, 0);
  assert.equal(legendModel(DEFAULT_CATEGORIES, {}, null).allPressed, true);
  assert.deepEqual(toggleFilter(null, "leo", keys), ["leo"]);
  assert.deepEqual(toggleFilter(["leo"], "starlink", keys), ["starlink", "leo"]);
  assert.equal(toggleFilter(["leo"], "leo", keys), null);
  assert.equal(toggleFilter(keys.slice(1), keys[0], keys), null);
});

test("time bar: offsets, label, 72 h warning", () => {
  const now = Date.parse("2026-11-08T10:14:30Z");
  assert.equal(offsetToDate(0, now).toISOString(), "2026-11-08T10:14:00.000Z");
  assert.equal(offsetToDate(200, now).toISOString(), "2026-11-08T13:34:00.000Z");
  assert.equal(offsetToDate(99999, now).toISOString(), "2026-11-09T10:14:00.000Z");
  assert.equal(dateToOffset(new Date("2026-11-08T13:34:00Z"), now), 200);
  assert.equal(offsetText(200), "+3 h 20 min");
  assert.equal(offsetText(-45), "-45 min");
  assert.equal(offsetText(-120), "-2 h");
  assert.equal(offsetText(0), "now");
  assert.equal(offsetText(4000), "+2 d 18 h");
  assert.equal(timeLabel(offsetToDate(200, now), now), "Sim time Nov 8, 5:34 AM (+3 h 20 min)");
  const meta = { fetchedAt: "2026-11-08T10:00:00Z" };
  assert.equal(accuracyWarning(new Date("2026-11-11T09:00:00Z"), meta), null);
  assert.equal(accuracyWarning(new Date("2026-11-11T11:00:00Z"), meta), "Positions less accurate this far from the orbit data");
  assert.notEqual(accuracyWarning(new Date("2026-11-04T00:00:00Z"), meta), null);
  assert.equal(accuracyWarning(new Date(), {}), null);
  // epochAt wins over fetchedAt: epoch 5 days before the download makes "now" already stale.
  const epochMeta = { fetchedAt: "2026-11-08T10:00:00Z", epochAt: "2026-11-03T10:00:00Z" };
  assert.notEqual(accuracyWarning(new Date("2026-11-08T10:00:00Z"), epochMeta), null);
  assert.equal(accuracyWarning(new Date("2026-11-08T10:00:00Z"), { fetchedAt: epochMeta.fetchedAt }), null);
});

test("card formatting", () => {
  assert.equal(formatLatLon(47.66, -122.2), "47.7 deg N, 122.2 deg W");
  assert.equal(formatLatLon(-33.04, 151.04), "33.0 deg S, 151.0 deg E");
  assert.equal(formatLaunchDate("2019-05-24"), "May 24, 2019");
  assert.equal(siteName("AFETR"), "Cape Canaveral");
  assert.equal(siteName("ZZZZ"), "ZZZZ");
  assert.equal(nextPassText(null), NO_PASS);
  assert.equal(nextPassText(undefined), "Next pass unavailable");
  const pass = { start: "2026-11-08T11:00:00Z", visibleStart: "2026-11-08T11:02:00Z", startAzDeg: 270, peakAzDeg: 180, endAzDeg: 90, peakElDeg: 62, visible: true };
  assert.equal(nextPassText(pass), "Nov 8, 3:02 AM: rises W, peaks 62 deg S, sets E. You could see it");
  assert.match(nextPassText({ ...pass, visible: false }), /Not visible/);
  assert.equal(builtNearText("leo", "Kirkland"), "Built in Kirkland, about 10 km from UW Bothell");
  assert.equal(builtNearText("starlink", "Redmond"), "Built in Redmond, about 10 km from UW Bothell");
  assert.equal(builtNearText("weather", "Redmond"), null);
  assert.equal(builtNearText("leo", null), null);
  const info = { name: "ISS (ZARYA)", category: "stations", ownerName: "ISS", launchDate: "1998-11-20", launchSite: "TTMTR", intlDes: "1998-067A",
    state: { latDeg: 10, lonDeg: -20, altKm: 421.6, speedKmS: 7.66, azDeg: 200, elDeg: 33, sunlit: true }, nextPass: null, builtNearUwb: "Kirkland" };
  const m = cardModel(idx[0], info, DEFAULT_CATEGORIES);
  const rows = Object.fromEntries(m.rows);
  assert.equal(rows.Launched, "Nov 20, 1998 from Baikonur");
  assert.equal(rows.Altitude, "422 km");
  assert.equal(rows.Speed, "7.7 km/s");
  assert.equal(rows.Over, "10.0 deg N, 20.0 deg W");
  assert.match(rows["From you"], /33 deg up, azimuth 200 deg, sunlit/);
  assert.equal(rows["Next pass"], NO_PASS);
  assert.equal(rows.Built, undefined);
  assert.deepEqual(m.sky, { az: 200, el: 33 });
  const below = cardModel(idx[3], { ...info, category: "starlink", state: { ...info.state, elDeg: -5, sunlit: false } }, DEFAULT_CATEGORIES);
  assert.equal(below.sky, null);
  assert.match(Object.fromEntries(below.rows)["From you"], /Below the horizon.*Earth's shadow/);
  assert.equal(Object.fromEntries(below.rows).Built, "Built in Kirkland, about 10 km from UW Bothell");
  assert.equal(cardModel(idx[0], null, DEFAULT_CATEGORIES).name, "ISS (ZARYA)");
});

test("identify list model", () => {
  const nameOf = (id) => ({ 25544: "ISS (ZARYA)" })[id];
  const m = identifyModel([{ noradId: 25544, sepDeg: 1.6, sunlit: true }, { noradId: 9, sepDeg: 0.2, sunlit: false }], nameOf, () => "stations", DEFAULT_CATEGORIES);
  assert.equal(m.empty, null);
  assert.equal(m.rows[0].sep, "2 deg away");
  assert.equal(m.rows[0].light, "sunlit");
  assert.equal(m.rows[1].name, "NORAD 9");
  assert.equal(m.rows[1].sep, "under 1 deg away");
  assert.equal(m.rows[1].light, "in Earth's shadow");
  assert.equal(identifyModel([], nameOf).empty, NO_FACING);
});

import { searchSats as _search } from "../web/ui/explore-model.js";
import { siteName as _site } from "../web/ui/card-model.js";
import { timeLabel as _label } from "../web/ui/time-model.js";

test("v2 polish: 'iss' finds the station first, SATCAT site codes map, a live clock reads now", () => {
  const idx = [{ noradId: 49044, name: "ISS (NAUKA)", category: "stations" }, { noradId: 25544, name: "ISS (ZARYA)", category: "stations" }];
  assert.equal(_search(idx, "ISS")[0].noradId, 25544);
  assert.equal(_search(idx, "nauka")[0].noradId, 49044);
  assert.equal(_site("TYMSC"), "Baikonur");
  assert.equal(_site("ZZZZ"), "ZZZZ");
  const now = Date.parse("2026-11-08T08:25:50Z");
  assert.match(_label(new Date(now + 5000), now), /\(now\)/);
});

test("tap vs drag on the look surface", () => {
  const d = { x: 100, y: 100, t: 0 };
  assert.equal(isTap(d, { x: 103, y: 102, t: 200 }), true);
  assert.equal(isTap(d, { x: 110, y: 100, t: 200 }), false); // moved too far
  assert.equal(isTap(d, { x: 101, y: 100, t: 400 }), false); // held too long
  assert.equal(isTap(null, d), false);
});
