import { conditionFromMet, conditionFromText, conditionFromWmo, consensusCondition } from "./conditions";
import { round1 } from "./format";
import { hourKeyNow, omLocalKey, zonedParts } from "./time";
import type {
  Briefing,
  BriefingInput,
  Condition,
  DayPoint,
  HourPoint,
  Observation,
  Place,
  RadarPack,
  SourceForecast,
  Spot,
} from "./types";

const UA = "QuorumWeather/1.0 (multi-model weather briefing)";

const MODELS: { id: string; model: string; label: string; agency: string }[] = [
  { id: "ecmwf", model: "ecmwf_ifs025", label: "ECMWF", agency: "European Centre" },
  { id: "gfs", model: "gfs_seamless", label: "GFS", agency: "NOAA" },
  { id: "icon", model: "icon_seamless", label: "ICON", agency: "DWD" },
  { id: "gem", model: "gem_global", label: "GEM", agency: "Environment Canada" },
];

type Member = {
  temp: (number | null)[];
  precip: (number | null)[];
  code: (number | null)[];
  wind: (number | null)[];
};

export async function loadBriefingData(input: BriefingInput): Promise<Briefing> {
  const latitude = input.latitude;
  const longitude = input.longitude;
  const timezone = safeZone(input.timezone);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return {
      error: "That place isn't on the map.",
      generatedAt: new Date().toISOString(),
      sources: [],
      observation: null,
    };
  }

  const signal = AbortSignal.timeout(8000);
  const [models, met, nwsPack] = await Promise.all([
    Promise.all(MODELS.map((model) => loadEnsemble(model, latitude, longitude, timezone, signal))),
    loadMet(latitude, longitude, timezone, signal),
    loadNws(latitude, longitude, timezone, signal),
  ]);

  return {
    error: null,
    generatedAt: new Date().toISOString(),
    sources: [...models, met, nwsPack.source],
    observation: nwsPack.observation,
  };
}

export async function searchPlacesData(query: string): Promise<Place[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const body = await fetchJson(url.toString());
  const results = asArray(asRecord(body)?.results);
  return results.map(mapGeoResult).filter((p): p is Place => p != null);
}

export async function reversePlaceData(latitude: number, longitude: number): Promise<Place | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "10");
  const body = await fetchJson(url.toString(), { "Accept-Language": "en" });
  const rec = asRecord(body);
  if (!rec) return null;
  const address = asRecord(rec.address);
  const name =
    str(address?.city) ||
    str(address?.town) ||
    str(address?.village) ||
    str(address?.municipality) ||
    str(address?.county) ||
    str(rec.name) ||
    "Your location";
  return {
    id: `geo:${latitude.toFixed(3)},${longitude.toFixed(3)}`,
    name,
    admin: str(address?.state) || "",
    country: str(address?.country) || "",
    countryCode: (str(address?.country_code) || "").toUpperCase(),
    latitude,
    longitude,
    timezone: "UTC",
  };
}

export async function loadRadarData(): Promise<RadarPack> {
  try {
    const body = await fetchJson("https://api.rainviewer.com/public/weather-maps.json");
    const rec = asRecord(body);
    const host = str(rec?.host) || "https://tilecache.rainviewer.com";
    const radar = asRecord(rec?.radar);
    const past = asArray(radar?.past).map((frame) => mapFrame(frame, "past")).filter((f): f is RadarPack["frames"][number] => f != null);
    const nowcast = asArray(radar?.nowcast)
      .map((frame) => mapFrame(frame, "nowcast"))
      .filter((f): f is RadarPack["frames"][number] => f != null);
    return { host, frames: [...past, ...nowcast], error: null };
  } catch {
    return { host: "", frames: [], error: "Radar didn't answer." };
  }
}

function mapFrame(value: unknown, kind: "past" | "nowcast"): RadarPack["frames"][number] | null {
  const rec = asRecord(value);
  const time = num(rec?.time);
  const path = str(rec?.path);
  if (time == null || !path) return null;
  return { time, path, kind };
}

async function loadEnsemble(
  model: (typeof MODELS)[number],
  latitude: number,
  longitude: number,
  timezone: string,
  signal: AbortSignal,
): Promise<SourceForecast> {
  const base = blankSource(model.id, model.label, model.agency);
  try {
    const url = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
    url.searchParams.set("latitude", latitude.toFixed(4));
    url.searchParams.set("longitude", longitude.toFixed(4));
    url.searchParams.set("hourly", "temperature_2m,precipitation,weather_code,wind_speed_10m");
    url.searchParams.set("models", model.model);
    url.searchParams.set("timezone", timezone);
    url.searchParams.set("forecast_days", "7");
    url.searchParams.set("wind_speed_unit", "kmh");
    const body = await fetchJson(url.toString(), undefined, signal);
    const rec = asRecord(body);
    if (rec?.error === true) {
      const reason = str(rec.reason) || "";
      return {
        ...base,
        status: /no data/i.test(reason) ? "unavailable" : "error",
        note: /no data/i.test(reason) ? "No coverage here" : friendlyUpstream(reason),
      };
    }
    const hourly = asRecord(rec?.hourly);
    const times = asArray(hourly?.time).map((t) => (typeof t === "string" ? t : ""));
    if (!hourly || times.length === 0) {
      return { ...base, status: "unavailable", note: "No coverage here" };
    }
    const members = collectMembers(hourly, times.length);
    if (!members.length) return { ...base, status: "unavailable", note: "No coverage here" };
    const rolled = rollMembers(times, members, timezone);
    return { ...base, status: "ok", members: members.length, days: rolled.days, hours: rolled.hours, spot: rolled.spot };
  } catch (err) {
    return { ...base, status: "error", note: friendlyUpstream(err instanceof Error ? err.message : "") };
  }
}

function collectMembers(hourly: Record<string, unknown>, length: number): Member[] {
  const prefixes = ["temperature_2m", "precipitation", "weather_code", "wind_speed_10m"] as const;
  const keys = new Set<string>();
  for (const prefix of prefixes) {
    for (const key of Object.keys(hourly)) {
      if (key === prefix) keys.add("");
      else if (key.startsWith(`${prefix}_member`)) keys.add(key.slice(prefix.length + 1));
    }
  }
  const members: Member[] = [];
  for (const suffix of keys) {
    const tail = suffix ? `_${suffix}` : "";
    const temp = series(hourly, `temperature_2m${tail}`, length);
    const precip = series(hourly, `precipitation${tail}`, length);
    const code = series(hourly, `weather_code${tail}`, length);
    const wind = series(hourly, `wind_speed_10m${tail}`, length);
    const filled = temp.filter((v) => v != null).length;
    if (filled < length * 0.4) continue;
    members.push({ temp, precip, code, wind });
  }
  return members;
}

function series(hourly: Record<string, unknown>, key: string, length: number): (number | null)[] {
  const raw = asArray(hourly[key]);
  const out: (number | null)[] = [];
  for (let i = 0; i < length; i += 1) out.push(num(raw[i]));
  return out;
}

function rollMembers(times: string[], members: Member[], timezone: string): { days: DayPoint[]; hours: HourPoint[]; spot: Spot | null } {
  const hours: HourPoint[] = [];
  const nowKey = hourKeyNow(timezone);
  for (let i = 0; i < times.length; i += 1) {
    const stamp = times[i];
    if (!stamp) continue;
    const { hourKey } = omLocalKey(stamp);
    const temps = pick(members, (m) => m.temp[i] ?? null);
    const precips = pick(members, (m) => m.precip[i] ?? null);
    const winds = pick(members, (m) => m.wind[i] ?? null);
    const codes = pick(members, (m) => m.code[i] ?? null);
    if (!temps.length) continue;
    const temp = avg(temps);
    const lo = Math.min(...temps);
    const hi = Math.max(...temps);
    hours.push({
      time: hourKey,
      tempC: temp == null ? null : round1(temp),
      tempMinC: round1(lo),
      tempMaxC: round1(hi),
      precipMm: round1(avg(precips) ?? 0),
      precipProb: precips.length ? Math.round((precips.filter((p) => p >= 0.1).length / precips.length) * 100) : null,
      windKmh: winds.length ? round1(avg(winds) ?? 0) : null,
      condition: consensusCondition(codes.map((c) => conditionFromWmo(c))),
    });
  }

  const byDate = new Map<string, HourPoint[]>();
  for (const hour of hours) {
    const date = hour.time.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push(hour);
    byDate.set(date, list);
  }

  const days: DayPoint[] = [];
  for (const [date, list] of byDate) {
    const memberHighs: number[] = [];
    const memberLows: number[] = [];
    const memberPrecip: number[] = [];
    const memberWind: number[] = [];
    const midday: Condition[] = [];
    for (const member of members) {
      const temps: number[] = [];
      let precip = 0;
      let wind = 0;
      let haveWind = false;
      let middayCode: number | null = null;
      let middayDist = 99;
      for (let i = 0; i < times.length; i += 1) {
        const stamp = times[i];
        if (!stamp || !stamp.startsWith(date)) continue;
        const temp = member.temp[i];
        if (temp != null) temps.push(temp);
        const p = member.precip[i];
        if (p != null) precip += p;
        const w = member.wind[i];
        if (w != null) {
          wind = Math.max(wind, w);
          haveWind = true;
        }
        const hour = Number(stamp.slice(11, 13));
        const dist = Math.abs(hour - 15);
        if (dist < middayDist && member.code[i] != null) {
          middayDist = dist;
          middayCode = member.code[i] ?? null;
        }
      }
      if (!temps.length) continue;
      memberHighs.push(Math.max(...temps));
      memberLows.push(Math.min(...temps));
      memberPrecip.push(precip);
      if (haveWind) memberWind.push(wind);
      if (middayCode != null) midday.push(conditionFromWmo(middayCode));
    }
    if (!memberHighs.length) continue;
    const high = avg(memberHighs);
    const low = avg(memberLows);
    days.push({
      date,
      highC: high == null ? null : round1(high),
      lowC: low == null ? null : round1(low),
      highMinC: round1(Math.min(...memberHighs)),
      highMaxC: round1(Math.max(...memberHighs)),
      precipMm: round1(avg(memberPrecip) ?? 0),
      precipProb: Math.round((memberPrecip.filter((p) => p >= 0.2).length / memberPrecip.length) * 100),
      windKmh: memberWind.length ? round1(avg(memberWind) ?? 0) : null,
      condition: consensusCondition(midday.length ? midday : list.map((h) => h.condition)),
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const spotHour = [...hours].reverse().find((h) => h.time <= nowKey) ?? hours[0] ?? null;
  const spot: Spot | null = spotHour
    ? {
        tempC: spotHour.tempC,
        humidity: null,
        windKmh: spotHour.windKmh,
        windDeg: null,
        pressureHpa: null,
        condition: spotHour.condition,
      }
    : null;
  return { days, hours, spot };
}

async function loadMet(latitude: number, longitude: number, timezone: string, signal: AbortSignal): Promise<SourceForecast> {
  const base = blankSource("metno", "MET Norway", "Norwegian Meteorological Institute");
  try {
    const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
    url.searchParams.set("lat", latitude.toFixed(4));
    url.searchParams.set("lon", longitude.toFixed(4));
    const body = await fetchJson(url.toString(), undefined, signal);
    const props = asRecord(asRecord(body)?.properties);
    const seriesRaw = asArray(props?.timeseries);
    const hours: HourPoint[] = [];
    const seen = new Set<string>();
    let coveredUntil = 0;
    let spot: Spot | null = null;
    let spotDist = Number.POSITIVE_INFINITY;
    const now = Date.now();

    for (const step of seriesRaw) {
      const rec = asRecord(step);
      const when = str(rec?.time);
      if (!when) continue;
      const data = asRecord(rec?.data);
      const instant = asRecord(asRecord(data?.instant)?.details);
      const stamp = Date.parse(when);
      if (!Number.isFinite(stamp)) continue;
      const parts = zonedParts(new Date(stamp), timezone);
      if (seen.has(parts.hourKey)) continue;
      seen.add(parts.hourKey);
      const temp = num(instant?.air_temperature);
      const windMs = num(instant?.wind_speed);
      const wind = windMs == null ? null : windMs * 3.6;
      const humidity = num(instant?.relative_humidity);
      const pressure = num(instant?.air_pressure_at_sea_level);
      const windDeg = num(instant?.wind_from_direction);
      const symbol =
        str(asRecord(asRecord(data?.next_1_hours)?.summary)?.symbol_code) ||
        str(asRecord(asRecord(data?.next_6_hours)?.summary)?.symbol_code) ||
        str(asRecord(asRecord(data?.next_12_hours)?.summary)?.symbol_code);
      let precip: number | null = null;
      let span = 0;
      const p1 = num(asRecord(asRecord(data?.next_1_hours)?.details)?.precipitation_amount);
      const p6 = num(asRecord(asRecord(data?.next_6_hours)?.details)?.precipitation_amount);
      const p12 = num(asRecord(asRecord(data?.next_12_hours)?.details)?.precipitation_amount);
      if (p1 != null) {
        precip = p1;
        span = 1;
      } else if (p6 != null) {
        precip = p6;
        span = 6;
      } else if (p12 != null) {
        precip = p12;
        span = 12;
      }
      let hourPrecip: number | null = null;
      if (precip != null && stamp >= coveredUntil) {
        hourPrecip = precip;
        coveredUntil = stamp + span * 3600000;
      }
      const condition = conditionFromMet(symbol);
      hours.push({
        time: parts.hourKey,
        tempC: temp == null ? null : round1(temp),
        tempMinC: temp == null ? null : round1(temp),
        tempMaxC: temp == null ? null : round1(temp),
        precipMm: hourPrecip == null ? null : round1(hourPrecip),
        precipProb: null,
        windKmh: wind == null ? null : round1(wind),
        condition,
      });
      const dist = Math.abs(stamp - now);
      if (dist < spotDist && temp != null) {
        spotDist = dist;
        spot = {
          tempC: round1(temp),
          humidity: humidity == null ? null : round1(humidity),
          windKmh: wind == null ? null : round1(wind),
          windDeg: windDeg == null ? null : round1(windDeg),
          pressureHpa: pressure == null ? null : round1(pressure),
          condition,
        };
      }
    }
    hours.sort((a, b) => a.time.localeCompare(b.time));
    if (!hours.length) return { ...base, status: "unavailable", note: "No coverage here" };
    return { ...base, status: "ok", members: 1, days: rollupDays(hours), hours, spot };
  } catch (err) {
    return { ...base, status: "error", note: friendlyUpstream(err instanceof Error ? err.message : "") };
  }
}

async function loadNws(
  latitude: number,
  longitude: number,
  timezone: string,
  signal: AbortSignal,
): Promise<{ source: SourceForecast; observation: Observation | null }> {
  const base = blankSource("nws", "NWS", "U.S. National Weather Service");
  try {
    const pointsUrl = `https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    let pointsBody: unknown;
    try {
      pointsBody = await fetchJson(pointsUrl, { Accept: "application/geo+json" }, signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/404/.test(message) || /not found/i.test(message)) {
        return { source: { ...base, status: "unavailable", note: "U.S. coverage only" }, observation: null };
      }
      throw err;
    }
    const props = asRecord(asRecord(pointsBody)?.properties);
    const forecastUrl = str(props?.forecast);
    const hourlyUrl = str(props?.forecastHourly);
    const stationsUrl = str(props?.observationStations);
    if (!forecastUrl) return { source: { ...base, status: "unavailable", note: "U.S. coverage only" }, observation: null };

    const [forecastBody, hourlyBody, stationsBody] = await Promise.all([
      fetchJson(forecastUrl, { Accept: "application/geo+json" }, signal).catch(() => null),
      hourlyUrl ? fetchJson(hourlyUrl, { Accept: "application/geo+json" }, signal).catch(() => null) : Promise.resolve(null),
      stationsUrl ? fetchJson(stationsUrl, { Accept: "application/geo+json" }, signal).catch(() => null) : Promise.resolve(null),
    ]);

    const periods = asArray(asRecord(asRecord(forecastBody)?.properties)?.periods);
    const days = nwsDays(periods, timezone);
    const hours = nwsHours(asArray(asRecord(asRecord(hourlyBody)?.properties)?.periods), timezone);
    const observation = await readObservation(stationsBody, signal);

    const spot = hours.find((h) => h.time >= hourKeyNow(timezone)) ?? hours[0] ?? null;
    if (!days.length && !hours.length) {
      return { source: { ...base, status: "unavailable", note: "U.S. coverage only" }, observation };
    }
    return {
      observation,
      source: {
        ...base,
        status: "ok",
        members: 1,
        days,
        hours,
        spot: spot
          ? {
              tempC: spot.tempC,
              humidity: null,
              windKmh: spot.windKmh,
              windDeg: null,
              pressureHpa: null,
              condition: spot.condition,
            }
          : null,
      },
    };
  } catch (err) {
    return {
      source: { ...base, status: "error", note: friendlyUpstream(err instanceof Error ? err.message : "") },
      observation: null,
    };
  }
}

function nwsDays(periods: unknown[], timezone: string): DayPoint[] {
  const buckets = new Map<string, DayPoint>();
  for (const period of periods) {
    const rec = asRecord(period);
    const start = str(rec?.startTime);
    if (!start) continue;
    const date = zonedParts(new Date(start), timezone).date;
    const unit = str(rec?.temperatureUnit) || "F";
    const temp = num(rec?.temperature);
    const tempC = temp == null ? null : unit.toUpperCase() === "C" ? temp : ((temp - 32) * 5) / 9;
    const pop = num(asRecord(rec?.probabilityOfPrecipitation)?.value);
    const wind = parseWindKmh(str(rec?.windSpeed));
    const condition = conditionFromText(str(rec?.shortForecast));
    const day = rec?.isDaytime === true;
    const existing = buckets.get(date) ?? {
      date,
      highC: null,
      lowC: null,
      highMinC: null,
      highMaxC: null,
      precipMm: null,
      precipProb: null,
      windKmh: null,
      condition: "unknown" as Condition,
    };
    if (tempC != null) {
      if (day) existing.highC = round1(tempC);
      else existing.lowC = existing.lowC == null ? round1(tempC) : round1(Math.min(existing.lowC, tempC));
    }
    if (pop != null) existing.precipProb = existing.precipProb == null ? pop : Math.max(existing.precipProb, pop);
    if (wind != null) existing.windKmh = existing.windKmh == null ? round1(wind) : round1(Math.max(existing.windKmh, wind));
    if (day || existing.condition === "unknown") existing.condition = condition;
    buckets.set(date, existing);
  }
  return [...buckets.values()]
    .map((day) => ({
      ...day,
      highMinC: day.highC,
      highMaxC: day.highC,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);
}

function nwsHours(periods: unknown[], timezone: string): HourPoint[] {
  const hours: HourPoint[] = [];
  for (const period of periods) {
    const rec = asRecord(period);
    const start = str(rec?.startTime);
    if (!start) continue;
    const unit = str(rec?.temperatureUnit) || "F";
    const temp = num(rec?.temperature);
    const tempC = temp == null ? null : unit.toUpperCase() === "C" ? temp : ((temp - 32) * 5) / 9;
    const pop = num(asRecord(rec?.probabilityOfPrecipitation)?.value);
    const wind = parseWindKmh(str(rec?.windSpeed));
    const key = zonedParts(new Date(start), timezone).hourKey;
    hours.push({
      time: key,
      tempC: tempC == null ? null : round1(tempC),
      tempMinC: tempC == null ? null : round1(tempC),
      tempMaxC: tempC == null ? null : round1(tempC),
      precipMm: null,
      precipProb: pop,
      windKmh: wind == null ? null : round1(wind),
      condition: conditionFromText(str(rec?.shortForecast)),
    });
    if (hours.length >= 168) break;
  }
  return hours;
}

async function readObservation(stationsBody: unknown, signal: AbortSignal): Promise<Observation | null> {
  const features = asArray(asRecord(stationsBody)?.features).slice(0, 4);
  for (const feature of features) {
    const props = asRecord(asRecord(feature)?.properties);
    const stationUrl = str(props?.["@id"]) || (str(props?.stationIdentifier) ? `https://api.weather.gov/stations/${str(props?.stationIdentifier)}` : "");
    if (!stationUrl) continue;
    const stationName = str(props?.name) || str(props?.stationIdentifier) || "Nearby station";
    try {
      const latest = await fetchJson(`${stationUrl}/observations/latest`, { Accept: "application/geo+json" }, signal);
      const obs = asRecord(asRecord(latest)?.properties);
      const tempC = quantity(obs?.temperature, "temp");
      const at = str(obs?.timestamp);
      if (tempC == null || !at) continue;
      const age = Date.now() - Date.parse(at);
      if (!Number.isFinite(age) || age > 6 * 3600 * 1000) continue;
      const text = str(obs?.textDescription) || "Observed";
      return {
        tempC: round1(tempC),
        humidity: quantity(obs?.relativeHumidity, "percent"),
        windKmh: quantity(obs?.windSpeed, "speed"),
        windDeg: quantity(obs?.windDirection, "angle"),
        pressureHpa: quantity(obs?.barometricPressure, "pressure"),
        condition: conditionFromText(text),
        text,
        at,
        station: stationName,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function rollupDays(hours: HourPoint[]): DayPoint[] {
  const byDate = new Map<string, HourPoint[]>();
  for (const hour of hours) {
    const date = hour.time.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push(hour);
    byDate.set(date, list);
  }
  const days: DayPoint[] = [];
  for (const [date, list] of byDate) {
    const temps = list.map((h) => h.tempC).filter((v): v is number => v != null);
    const precips = list.map((h) => h.precipMm).filter((v): v is number => v != null);
    const winds = list.map((h) => h.windKmh).filter((v): v is number => v != null);
    const daytime = list.filter((h) => {
      const hour = Number(h.time.slice(11, 13));
      return hour >= 11 && hour <= 17;
    });
    if (!temps.length) continue;
    const high = Math.max(...temps);
    const low = Math.min(...temps);
    days.push({
      date,
      highC: round1(high),
      lowC: round1(low),
      highMinC: round1(high),
      highMaxC: round1(high),
      precipMm: precips.length ? round1(precips.reduce((s, n) => s + n, 0)) : null,
      precipProb: null,
      windKmh: winds.length ? round1(Math.max(...winds)) : null,
      condition: consensusCondition((daytime.length ? daytime : list).map((h) => h.condition)),
    });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}

function blankSource(id: string, label: string, agency: string): SourceForecast {
  return {
    id,
    label,
    agency,
    members: null,
    status: "error",
    note: null,
    days: [],
    hours: [],
    spot: null,
  };
}

function mapGeoResult(value: unknown): Place | null {
  const rec = asRecord(value);
  const name = str(rec?.name);
  const latitude = num(rec?.latitude);
  const longitude = num(rec?.longitude);
  if (!name || latitude == null || longitude == null) return null;
  return {
    id: String(rec?.id ?? `${latitude},${longitude}`),
    name,
    admin: str(rec?.admin1) || "",
    country: str(rec?.country) || "",
    countryCode: str(rec?.country_code) || "",
    latitude,
    longitude,
    timezone: str(rec?.timezone) || "UTC",
  };
}

async function fetchJson(url: string, extra?: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA, ...extra },
    signal: signal ?? AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const rec = asRecord(body);
    const reason = str(rec?.reason) || str(rec?.detail) || str(rec?.title) || "Request failed";
    throw new Error(`HTTP ${res.status}: ${reason}`);
  }
  return body;
}

function friendlyUpstream(reason: string): string {
  if (/limit/i.test(reason)) return "Daily limit reached";
  if (/timeout|abort/i.test(reason)) return "Timed out";
  if (/no data|not found|404/i.test(reason)) return "No coverage here";
  return "Didn't answer";
}

function parseWindKmh(text: string | null): number | null {
  if (!text) return null;
  if (/calm/i.test(text)) return 0;
  const nums = text.match(/\d+(\.\d+)?/g);
  if (!nums?.length) return null;
  const max = Math.max(...nums.map(Number));
  return max * 1.60934;
}

function quantity(node: unknown, kind: "temp" | "percent" | "speed" | "angle" | "pressure"): number | null {
  const rec = asRecord(node);
  const value = num(rec?.value);
  if (value == null) return null;
  const unit = str(rec?.unitCode) || "";
  if (kind === "temp") {
    if (/degF/i.test(unit)) return ((value - 32) * 5) / 9;
    return value;
  }
  if (kind === "speed") {
    if (/m_s|m\/s/i.test(unit)) return value * 3.6;
    if (/mph|mile/i.test(unit)) return value * 1.60934;
    return value;
  }
  if (kind === "pressure") {
    if (value > 2000) return value / 100;
    return value;
  }
  if (kind === "percent") return value;
  return value;
}

function pick(members: Member[], read: (member: Member) => number | null): number[] {
  const out: number[] = [];
  for (const member of members) {
    const value = read(member);
    if (value != null) out.push(value);
  }
  return out;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function safeZone(timeZone: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
