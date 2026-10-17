import type { Units } from "./types";

export function toDisplay(celsius: number, units: Units): number {
  return units === "f" ? (celsius * 9) / 5 + 32 : celsius;
}

export function formatTemp(celsius: number | null, units: Units): string {
  if (celsius == null || !Number.isFinite(celsius)) return "—";
  return `${Math.round(toDisplay(celsius, units))}°`;
}

export function formatPrecip(mm: number | null, units: Units): string {
  if (mm == null || !Number.isFinite(mm)) return "—";
  if (units === "f") {
    const inches = mm / 25.4;
    if (inches < 0.005) return "0 in";
    return `${inches < 0.1 ? inches.toFixed(2) : inches.toFixed(2)} in`;
  }
  if (mm < 0.05) return "0 mm";
  return mm < 10 ? `${mm.toFixed(1)} mm` : `${Math.round(mm)} mm`;
}

export function formatWind(kmh: number | null, units: Units): string {
  if (kmh == null || !Number.isFinite(kmh)) return "—";
  if (units === "f") return `${Math.round(kmh / 1.60934)} mph`;
  return `${Math.round(kmh)} km/h`;
}

export function formatPressure(hpa: number | null, units: Units): string {
  if (hpa == null || !Number.isFinite(hpa)) return "—";
  if (units === "f") return `${(hpa * 0.02953).toFixed(2)} inHg`;
  return `${Math.round(hpa)} hPa`;
}

export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function cardinal(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return "";
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return DIRS[i] ?? "";
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const left = sorted[mid];
  if (left == null) return null;
  if (sorted.length % 2) return left;
  const prev = sorted[mid - 1];
  if (prev == null) return left;
  return (prev + left) / 2;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
