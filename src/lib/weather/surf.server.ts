import { parseSurfResponse } from "./surf-core.js";
import type { BriefingInput, SurfBriefing } from "./types";

const UA = "QuorumWeather/1.0 (surf forecast)";
const WAVE_BASE = "https://wave-api.open-meteo.com/v1/forecast";

function empty(error: string | null): SurfBriefing {
  return { error, generatedAt: new Date().toISOString(), source: "Open-Meteo Wave", days: [], spot: null };
}

/**
 * Fetch a short-term wave forecast for a coordinate from the Open-Meteo Wave
 * API (free, keyless — the same provider already used for the air models).
 */
export async function loadSurfData(input: BriefingInput): Promise<SurfBriefing> {
  const latitude = input.latitude;
  const longitude = input.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return empty("That place isn't on the map.");
  }

  try {
    const url = new URL(WAVE_BASE);
    url.searchParams.set("latitude", latitude.toFixed(4));
    url.searchParams.set("longitude", longitude.toFixed(4));
    url.searchParams.set("timezone", safeZone(input.timezone));
    url.searchParams.set("forecast_days", "7");
    const body = await fetchJson(url.toString());
    const rec = record(body);
    if (rec?.error === true) {
      const reason = String(rec.reason ?? "No wave data here.");
      return empty(/no data|not found/i.test(reason) ? "No wave data here." : "The wave service didn't answer.");
    }
    const parsed = parseSurfResponse(body);
    if (parsed.error) return empty(parsed.error);
    return {
      error: null,
      generatedAt: new Date().toISOString(),
      source: "Open-Meteo Wave",
      days: parsed.days,
      spot: parsed.spot,
    };
  } catch {
    return empty("The wave service didn't answer.");
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const rec = record(body);
    const reason = String(rec?.reason ?? rec?.detail ?? "Request failed");
    throw new Error(`HTTP ${res.status}: ${reason}`);
  }
  return body;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : null;
}

function safeZone(timeZone: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}
