import { consensusCondition } from "./conditions";
import { mean, median, toDisplay } from "./format";
import type { Condition, HourPoint, SourceForecast, Units } from "./types";

export type ConsensusDay = {
  date: string;
  highC: number | null;
  lowC: number | null;
  spreadC: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windKmh: number | null;
  condition: Condition;
  reporting: number;
};

export type ChartPoint = {
  key: string;
  label: string;
  tip: string;
  temp: number | null;
  bandBase: number | null;
  band: number | null;
  pop: number | null;
};

export function activeSources(sources: SourceForecast[], enabled: ReadonlySet<string>): SourceForecast[] {
  return sources.filter((s) => s.status === "ok" && enabled.has(s.id));
}

export function allDates(sources: SourceForecast[]): string[] {
  const dates = new Set<string>();
  for (const source of sources) {
    if (source.status !== "ok") continue;
    for (const day of source.days) dates.add(day.date);
  }
  return [...dates].sort();
}

export function buildDays(sources: SourceForecast[], enabled: ReadonlySet<string>): ConsensusDay[] {
  const dates = allDates(sources);
  const use = activeSources(sources, enabled);
  return dates.map((date) => {
    const rows = use
      .map((source) => source.days.find((day) => day.date === date))
      .filter((day): day is NonNullable<typeof day> => day != null);
    const highs = rows.map((d) => d.highC).filter((v): v is number => v != null);
    const lows = rows.map((d) => d.lowC).filter((v): v is number => v != null);
    const precips = rows.map((d) => d.precipMm).filter((v): v is number => v != null);
    const pops = rows.map((d) => d.precipProb).filter((v): v is number => v != null);
    const winds = rows.map((d) => d.windKmh).filter((v): v is number => v != null);
    const high = median(highs);
    const low = median(lows);
    return {
      date,
      highC: high,
      lowC: low,
      spreadC: highs.length >= 2 ? Math.max(...highs) - Math.min(...highs) : null,
      precipMm: median(precips),
      precipProb: mean(pops),
      windKmh: median(winds),
      condition: consensusCondition(rows.map((d) => d.condition)),
      reporting: rows.length,
    };
  });
}

export function agreementFor(spreadC: number | null, reporting: number, units: Units): {
  tone: "single" | "tight" | "modest" | "wide";
  label: string;
  detail: string;
} {
  if (reporting < 2 || spreadC == null) {
    return {
      tone: "single",
      label: "One office",
      detail: reporting < 1 ? "Nobody has reported this day." : "Not enough forecasts to compare.",
    };
  }
  const shown = toDisplay(spreadC, units) - toDisplay(0, units);
  const tight = units === "f" ? 4 : 2;
  const modest = units === "f" ? 8 : 4;
  const rounded = Math.max(1, Math.round(shown));
  const detail = `Highs span ${rounded}°.`;
  if (shown <= tight) return { tone: "tight", label: "Tight agreement", detail };
  if (shown <= modest) return { tone: "modest", label: "Some spread", detail };
  return { tone: "wide", label: "Models diverge", detail };
}

export function chartHours(
  sources: SourceForecast[],
  enabled: ReadonlySet<string>,
  selected: string | null,
  today: string,
  nowKey: string,
): string[] {
  const use = activeSources(sources, enabled);
  const keys = new Set<string>();
  for (const source of use) {
    for (const hour of source.hours) keys.add(hour.time);
  }
  const sorted = [...keys].sort();
  if (!selected || selected === today) {
    return sorted.filter((key) => key >= nowKey).slice(0, 24);
  }
  return sorted.filter((key) => key.startsWith(selected));
}

export function buildChart(
  sources: SourceForecast[],
  enabled: ReadonlySet<string>,
  keys: string[],
  units: Units,
  tipFor: (hourKey: string) => string,
  tickFor: (hourKey: string) => string,
): ChartPoint[] {
  const use = activeSources(sources, enabled);
  return keys.map((key) => {
    const rows: HourPoint[] = [];
    for (const source of use) {
      const hour = source.hours.find((h) => h.time === key);
      if (hour) rows.push(hour);
    }
    const temps = rows.map((h) => h.tempC).filter((v): v is number => v != null);
    const pops = rows.map((h) => h.precipProb).filter((v): v is number => v != null);
    const mid = median(temps);
    const lo = temps.length ? Math.min(...temps) : null;
    const hi = temps.length ? Math.max(...temps) : null;
    const bandBase = lo == null ? null : toDisplay(lo, units);
    const bandTop = hi == null ? null : toDisplay(hi, units);
    return {
      key,
      label: tickFor(key),
      tip: tipFor(key),
      temp: mid == null ? null : Math.round(toDisplay(mid, units)),
      bandBase,
      band: bandBase != null && bandTop != null ? Math.max(0, bandTop - bandBase) : null,
      pop: mean(pops),
    };
  });
}
