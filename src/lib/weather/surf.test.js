import test from "node:test";
import assert from "node:assert/strict";
import {
  formatWaveHeight,
  formatWavePeriod,
  isSurfToday,
  parseSurfResponse,
  surfQuality,
  surfQualityLabel,
  waveDirection,
} from "./surf-core.js";

test("formatWaveHeight converts meters to the chosen units", () => {
  assert.equal(formatWaveHeight(0.5, "c"), "0.5 m");
  assert.equal(formatWaveHeight(1.524, "f"), "5.0 ft");
  assert.equal(formatWaveHeight(null, "c"), "—");
  assert.equal(formatWaveHeight(Number.NaN, "f"), "—");
});

test("formatWavePeriod rounds and handles missing values", () => {
  assert.equal(formatWavePeriod(8.4), "8s");
  assert.equal(formatWavePeriod(10), "10s");
  assert.equal(formatWavePeriod(null), "—");
});

test("waveDirection maps degrees to the 16-point compass", () => {
  assert.equal(waveDirection(0), "N");
  assert.equal(waveDirection(22.5), "NNE");
  assert.equal(waveDirection(90), "E");
  assert.equal(waveDirection(225), "SW");
  assert.equal(waveDirection(360), "N");
  assert.equal(waveDirection(-45), "NW");
  assert.equal(waveDirection(null), "");
});

test("isSurfToday only matches a real, non-empty anchor date", () => {
  assert.equal(isSurfToday("2026-10-18", "2026-10-18"), true);
  assert.equal(isSurfToday("2026-10-19", "2026-10-18"), false);
  // A missing/empty anchor must never collapse every day to "Today".
  assert.equal(isSurfToday("2026-10-18", ""), false);
  assert.equal(isSurfToday("2026-10-18", null), false);
  assert.equal(isSurfToday("2026-10-18", undefined), false);
  assert.equal(isSurfToday("", "2026-10-18"), false);
});

test("surfQuality buckets by height", () => {
  assert.equal(surfQuality(0.1), "flat");
  assert.equal(surfQuality(0.5), "small");
  assert.equal(surfQuality(1.5), "good");
  assert.equal(surfQuality(2.5), "large");
  assert.equal(surfQuality(4), "big");
  assert.equal(surfQuality(null), "none");
  assert.equal(surfQualityLabel("good"), "Good");
});

test("parseSurfResponse reads a daily block and derives the spot", () => {
  const body = {
    daily: {
      time: ["2026-10-18", "2026-10-19", "2026-10-20"],
      wave_height: [0.4, 1.4, 2.6],
      mean_wave_period: [8, 9, 11],
      dominant_wave_direction: [210, 230, 250],
    },
  };
  const out = parseSurfResponse(body);
  assert.equal(out.error, null);
  assert.equal(out.days.length, 3);
  assert.deepEqual(out.days[0], { date: "2026-10-18", heightM: 0.4, periodS: 8, directionDeg: 210, quality: "small" });
  assert.equal(out.spot.date, "2026-10-18");
  assert.equal(out.spot.quality, "small");
});

test("parseSurfResponse ignores empty or missing values in a daily block", () => {
  const body = {
    daily: {
      time: ["2026-10-18", "2026-10-19"],
      wave_height: [null, 1.2],
      mean_wave_period: [null, null],
      dominant_wave_direction: [null, 180],
    },
  };
  const out = parseSurfResponse(body);
  assert.equal(out.days.length, 2);
  assert.equal(out.days[0].heightM, null);
  assert.equal(out.days[0].quality, "none");
  // The first day has no reading, so the spot is the first day that does.
  assert.equal(out.spot?.date, "2026-10-19");
});

test("parseSurfResponse rolls hourly data up by day", () => {
  const body = {
    hourly: {
      time: ["2026-10-18T00:00", "2026-10-18T12:00", "2026-10-19T06:00"],
      wave_height: [1.0, 1.8, 0.6],
      mean_wave_period: [8, 10, 6],
      dominant_wave_direction: [180, 200, 220],
    },
  };
  const out = parseSurfResponse(body);
  assert.equal(out.error, null);
  assert.equal(out.days.length, 2);
  const first = out.days.find((d) => d.date === "2026-10-18");
  assert.equal(first?.heightM, 1.8); // peak of that day
  assert.equal(first?.periodS, 9); // mean of 8 and 10
  assert.equal(first?.directionDeg, 190); // mean of 180 and 200
});

test("parseSurfResponse reports a friendly error on empty input", () => {
  assert.equal(parseSurfResponse(null).error, "No wave data here.");
  assert.equal(parseSurfResponse({}).error, "No wave data here.");
  assert.equal(parseSurfResponse({ daily: {} }).error, "No wave data here.");
});
