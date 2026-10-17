import type { Condition } from "./types";

export const CONDITION_LABEL: Record<Condition, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorms",
  unknown: "Unknown",
};

const RANK: Record<Condition, number> = {
  unknown: 0,
  clear: 1,
  partly: 2,
  cloudy: 3,
  fog: 4,
  drizzle: 5,
  rain: 6,
  snow: 7,
  thunder: 8,
};

export function conditionFromWmo(code: number | null): Condition {
  if (code == null || !Number.isFinite(code)) return "unknown";
  const c = Math.round(code);
  if (c === 0) return "clear";
  if (c === 1 || c === 2) return "partly";
  if (c === 3) return "cloudy";
  if (c === 45 || c === 48) return "fog";
  if (c >= 51 && c <= 57) return "drizzle";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  if (c >= 95) return "thunder";
  return "unknown";
}

export function conditionFromText(text: string | null | undefined): Condition {
  if (!text) return "unknown";
  const s = text.toLowerCase();
  if (s.includes("thunder") || s.includes("tstm")) return "thunder";
  if (s.includes("snow") || s.includes("flurr") || s.includes("sleet") || s.includes("ice")) return "snow";
  if (s.includes("drizzle")) return "drizzle";
  if (s.includes("rain") || s.includes("shower")) return "rain";
  if (s.includes("fog") || s.includes("mist")) return "fog";
  if (s.includes("partly") || s.includes("mostly sunny") || s.includes("mostly clear")) return "partly";
  if (s.includes("cloud") || s.includes("overcast")) return "cloudy";
  if (s.includes("sun") || s.includes("clear") || s.includes("fair")) return "clear";
  return "unknown";
}

export function conditionFromMet(symbol: string | null | undefined): Condition {
  if (!symbol) return "unknown";
  const s = symbol.toLowerCase();
  if (s.includes("thunder")) return "thunder";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("drizzle")) return "drizzle";
  if (s.includes("rain") || s.includes("shower")) return "rain";
  if (s.includes("fog")) return "fog";
  if (s.includes("partly")) return "partly";
  if (s.includes("cloud")) return "cloudy";
  if (s.includes("fair") || s.includes("clear")) return "clear";
  return "unknown";
}

export function consensusCondition(list: Condition[]): Condition {
  const counts = new Map<Condition, number>();
  for (const c of list) {
    if (c === "unknown") continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: Condition = "unknown";
  let bestScore = -1;
  for (const [c, n] of counts) {
    const score = n * 10 + RANK[c];
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
