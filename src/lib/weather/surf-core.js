// Pure surf / wave helpers. No network, no server-only dependencies — safe in
// the browser and in unit tests. The server loader (surf.server.ts) fetches the
// Open-Meteo wave API and hands the raw JSON body to `parseSurfResponse`.

const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

const QUALITY_LABEL = {
  none: "—",
  flat: "Flat",
  small: "Small",
  good: "Good",
  large: "Large",
  big: "Big",
};

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function record(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function arr(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function numOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @param {number} value
 * @returns {number}
 */
function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * @param {number | null} seconds
 * @returns {string}
 */
export function formatWavePeriod(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  return `${Math.round(seconds)}s`;
}

/**
 * @param {number | null} meters
 * @param {"f" | "c"} units
 * @returns {string}
 */
export function formatWaveHeight(meters, units) {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (units === "f") return `${(meters * 3.28084).toFixed(1)} ft`;
  return `${Number(meters.toFixed(2))} m`;
}

/**
 * @param {number | null} deg
 * @returns {string}
 */
export function waveDirection(deg) {
  if (deg == null || !Number.isFinite(deg)) return "";
  const norm = ((deg % 360) + 360) % 360;
  const index = Math.round(norm / 22.5) % 16;
  return DIRS[index] ?? "";
}

/**
 * @param {number | null} heightM
 * @returns {string}
 */
export function surfQuality(heightM) {
  if (heightM == null || !Number.isFinite(heightM)) return "none";
  if (heightM < 0.3) return "flat";
  if (heightM < 1.0) return "small";
  if (heightM < 2.0) return "good";
  if (heightM < 3.5) return "large";
  return "big";
}

/**
 * @param {string} quality
 * @returns {string}
 */
export function surfQualityLabel(quality) {
  return QUALITY_LABEL[quality] ?? "—";
}

/**
 * Whether a surf day is "today" for highlighting/labels. Guarded so a missing
 * or empty `today` anchor never collapses every day to "Today".
 *
 * @param {string | null} date
 * @param {string | null} today
 * @returns {boolean}
 */
export function isSurfToday(date, today) {
  return Boolean(date) && typeof today === "string" && today.length > 0 && date === today;
}

/**
 * Turn a raw Open-Meteo wave forecast body into a compact briefing. Accepts
 * either a `daily` block (preferred) or falls back to rolling `hourly` data up
 * by calendar day. Pure: no clock, no network.
 *
 * @param {unknown} body
 * @returns {{
 *   days: { date: string; heightM: number | null; periodS: number | null; directionDeg: number | null; quality: string }[],
 *   spot: { heightM: number | null; periodS: number | null; directionDeg: number | null; quality: string } | null,
 *   error: string | null
 * }}
 */
export function parseSurfResponse(body) {
  /** @type {{ date: string; heightM: number | null; periodS: number | null; directionDeg: number | null; quality: string }[]} */
  const days = [];
  /** @type {{ date: string; heightM: number | null; periodS: number | null; directionDeg: number | null; quality: string } | null} */
  let spot = null;
  const remember = (day) => {
    days.push(day);
    if (spot == null && day.heightM != null) spot = { date: day.date, heightM: day.heightM, periodS: day.periodS, directionDeg: day.directionDeg, quality: day.quality };
  };

  const rec = record(body);
  const daily = rec ? record(rec.daily) : null;
  const hours = rec ? record(rec.hourly) : null;

  if (daily) {
    const times = arr(daily.time);
    const heights = arr(daily.wave_height);
    const periods = arr(daily.mean_wave_period);
    const dirs = arr(daily.dominant_wave_direction);
    for (let i = 0; i < times.length; i += 1) {
      const date = typeof times[i] === "string" ? times[i].slice(0, 10) : "";
      if (!date) continue;
      const heightM = numOrNull(heights[i]);
      const periodS = numOrNull(periods[i]);
      const directionDeg = numOrNull(dirs[i]);
      remember({ date, heightM, periodS, directionDeg, quality: surfQuality(heightM) });
    }
  } else if (hours) {
    const times = arr(hours.time);
    const heights = arr(hours.wave_height);
    const periods = arr(hours.mean_wave_period);
    const dirs = arr(hours.dominant_wave_direction);
    /** @type {Map<string, { date: string; peakM: number | null; periods: number[]; dirs: number[] }>} */
    const byDate = new Map();
    for (let i = 0; i < times.length; i += 1) {
      const stamp = typeof times[i] === "string" ? times[i] : "";
      const date = stamp.slice(0, 10);
      if (!date) continue;
      const heightM = numOrNull(heights[i]);
      const periodS = numOrNull(periods[i]);
      const directionDeg = numOrNull(dirs[i]);
      const bucket = byDate.get(date) ?? { date, peakM: null, periods: [], dirs: [] };
      if (heightM != null) {
        bucket.peakM = bucket.peakM == null ? heightM : Math.max(bucket.peakM, heightM);
        if (periodS != null) bucket.periods.push(periodS);
        if (directionDeg != null) bucket.dirs.push(directionDeg);
      }
      byDate.set(date, bucket);
    }
    for (const bucket of [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
      const periodS = bucket.periods.length ? round1(bucket.periods.reduce((sum, n) => sum + n, 0) / bucket.periods.length) : null;
      const directionDeg = bucket.dirs.length ? round1(bucket.dirs.reduce((sum, n) => sum + n, 0) / bucket.dirs.length) : null;
      remember({ date: bucket.date, heightM: bucket.peakM, periodS, directionDeg, quality: surfQuality(bucket.peakM) });
    }
  }

  if (!days.length) return { days: [], spot: null, error: "No wave data here." };
  return { days, spot, error: null };
}
