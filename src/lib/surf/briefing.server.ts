import type { BriefingInput } from "../weather/types";
import type { SurfBriefing, SwellComponent, SurfSpot, SurfDayPoint } from "./types";

const STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY || "your-api-key-here";

function degToCardinal(deg: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(((deg % 360 + 360) % 360) / 45) % 8;
  return directions[index];
}

function safeZone(timeZone: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

export async function loadSurfData(input: BriefingInput): Promise<SurfBriefing> {
  const latitude = input.latitude;
  const longitude = input.longitude;
  const timezone = safeZone(input.timezone);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return {
      error: "That place isn't on the map.",
      generatedAt: new Date().toISOString(),
      spot: null,
      days: [],
    };
  }

  const signal = AbortSignal.timeout(8000);

  try {
    const startTime = new Date();
    const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Fetch current and forecast wave data from Stormglass
    const url = new URL("https://api.stormglass.io/v2/wave/point");
    url.searchParams.set("lat", latitude.toFixed(4));
    url.searchParams.set("lng", longitude.toFixed(4));
    url.searchParams.set(
      "params",
      "waveHeight,wavePeriod,swell[0]_height,swell[1]_height,swell[2]_height,swell[0]_period,swell[1]_period,swell[2]_period,swell[0]_direction,swell[1]_direction,swell[2]_direction,windspeed,windDirection",
    );
    url.searchParams.set("startTime", startTime.toISOString());
    url.searchParams.set("endTime", endTime.toISOString());

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${STORMGLASS_API_KEY}`,
        Accept: "application/json",
        "User-Agent": "QuorumWeather/1.0 (surf forecast)",
      },
      signal,
    });

    if (!response.ok) {
      return {
        error: `Surf data unavailable: ${response.statusText}`,
        generatedAt: new Date().toISOString(),
        spot: null,
        days: [],
      };
    }

    const data = await response.json();
    const spot = transformCurrentSpot(data.hourly);
    const days = transformDailyForecast(data.hourly, timezone);

    return {
      error: null,
      generatedAt: new Date().toISOString(),
      spot,
      days,
    };
  } catch (err) {
    return {
      error: `Failed to load surf data: ${err instanceof Error ? err.message : "Unknown error"}`,
      generatedAt: new Date().toISOString(),
      spot: null,
      days: [],
    };
  }
}

function extractMetricValue(node: unknown): number | null {
  const rec = node && typeof node === "object" ? (node as Record<string, unknown>) : null;
  if (!rec) return null;
  const metric = rec.metric;
  if (metric == null || typeof metric !== "object") return null;
  const val = (metric as Record<string, unknown>)["value"];
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function transformCurrentSpot(hourlyData: unknown[]): SurfSpot {
  if (!Array.isArray(hourlyData) || hourlyData.length === 0) {
    return {
      waveHeightM: null,
      wavePeriodS: null,
      waveDirectionDeg: null,
      dominantSwellDirection: null,
      swellComponents: [],
      windSpeedKmh: null,
      windDirectionDeg: null,
    };
  }

  const hour0 = hourlyData[0];
  if (!hour0 || typeof hour0 !== "object") {
    return {
      waveHeightM: null,
      wavePeriodS: null,
      waveDirectionDeg: null,
      dominantSwellDirection: null,
      swellComponents: [],
      windSpeedKmh: null,
      windDirectionDeg: null,
    };
  }

  const rec = hour0 as Record<string, unknown>;

  // Extract swell components from Stormglass response structure
  const swells: SwellComponent[] = [];
  for (let i = 0; i <= 2; i++) {
    const swellKey = `swell[${i}]`;
    const heightVal = extractMetricValue((rec as Record<string, unknown>)[`${swellKey}_height`]);
    const periodVal = extractMetricValue((rec as Record<string, unknown>)[`${swellKey}_period`]);
    const directionVal = extractMetricValue((rec as Record<string, unknown>)[`${swellKey}_direction`]);

    swells.push({
      heightM: heightVal,
      periodS: periodVal,
      directionDeg: directionVal,
      directionCardinal: directionVal != null ? degToCardinal(directionVal) : "N/A",
    });
  }

  // Use the dominant (first significant) swell for wave direction
  const domSwell = swells.find((s) => s.heightM != null && s.heightM > 0.05);
  const domDirectionDeg = domSwell?.directionDeg ?? null;

  return {
    waveHeightM: extractMetricValue(rec.waveHeight),
    wavePeriodS: extractMetricValue(rec.wavePeriod),
    waveDirectionDeg: domDirectionDeg,
    dominantSwellDirection: domDirectionDeg != null ? degToCardinal(domDirectionDeg) : null,
    swellComponents: swells,
    windSpeedKmh: extractMetricValue(rec.windspeed),
    windDirectionDeg: extractMetricValue(rec.windDirection),
  };
}

function transformDailyForecast(hourlyData: unknown[], timezone: string): SurfDayPoint[] {
  const grouped = new Map<string, unknown[]>();

  for (const hour of hourlyData) {
    if (!hour || typeof hour !== "object") continue;
    const rec = hour as Record<string, unknown>;
    const timeStr = String(rec.time ?? "");
    if (!timeStr.includes("T")) continue;
    const date = timeStr.slice(0, 10);
    if (!date) continue;

    const list = grouped.get(date) ?? [];
    list.push(hour);
    grouped.set(date, list);
  }

  const days: SurfDayPoint[] = [];

  for (const [date, hours] of grouped) {
    const result = calculateDailyAverage(hours);
    days.push({
      date,
      avgHeightM: result.avgHeightM,
      avgPeriodS: result.avgPeriodS,
      dominantDirection: result.dominantDirection,
      score: result.score,
      swellCount: result.swellCount,
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return days.slice(0, 7);
}

function calculateDailyAverage(hours: unknown[]): Omit<SurfDayPoint, "date"> {
  let totalHeight = 0;
  let totalPeriod = 0;
  let heightCount = 0;
  let periodCount = 0;
  const swellDirections: number[] = [];

  for (const hour of hours) {
    if (!hour || typeof hour !== "object") continue;
    const rec = hour as Record<string, unknown>;

    // Find the most significant swell component (height > 0.1m)
    let dominantHeight: number | null = null;
    for (let i = 0; i <= 2; i++) {
      const val = extractMetricValue((rec as Record<string, unknown>)[`swell[${i}]_height`]);
      if (val != null && val > 0.1) {
        if (dominantHeight == null || val > dominantHeight) {
          dominantHeight = val;
        }
      }
    }

    if (dominantHeight != null) {
      totalHeight += dominantHeight;
      heightCount++;

      // Track direction from the same swell that has max height
      for (let i = 0; i <= 2; i++) {
        const val = extractMetricValue((rec as Record<string, unknown>)[`swell[${i}]_height`]);
        if (val != null && val === dominantHeight) {
          const dirVal = extractMetricValue((rec as Record<string, unknown>)[`swell[${i}]_direction`]);
          if (dirVal != null) {
            swellDirections.push(dirVal);
          }
        }
      }
    }

    const periodVal = extractMetricValue(rec.wavePeriod);
    if (periodVal != null) {
      totalPeriod += periodVal;
      periodCount++;
    }
  }

  const avgHeightM = heightCount > 0 ? round1(totalHeight / heightCount) : null;
  const avgPeriodS = periodCount > 0 ? round1(totalPeriod / periodCount) : null;

  // Determine dominant direction
  let dominantDirection = "N/A";
  if (swellDirections.length > 0) {
    const avgDir = swellDirections.reduce((sum, dir) => sum + dir, 0) / swellDirections.length;
    dominantDirection = degToCardinal(avgDir);
  }

  // Calculate quality score (1-10)
  let score = 0;
  if (avgHeightM != null && avgHeightM >= 0.5 && avgHeightM <= 4.0) {
    score += 4;
  } else if (avgHeightM != null && avgHeightM > 4.0 && avgHeightM <= 6.0) {
    score += 2; // Big day, harder to surf
  }

  if (avgPeriodS != null && avgPeriodS >= 10) {
    score += 3; // Long period = great waves
  } else if (avgPeriodS != null && avgPeriodS >= 7) {
    score += 2;
  } else if (avgPeriodS != null && avgPeriodS >= 5) {
    score += 1;
  }

  // Penalty for very small or very large waves
  if (avgHeightM != null && (avgHeightM < 0.3 || avgHeightM > 8.0)) {
    score = Math.min(score, 1);
  }

  return {
    avgHeightM,
    avgPeriodS,
    dominantDirection,
    score: Math.min(score, 10),
    swellCount: heightCount,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
