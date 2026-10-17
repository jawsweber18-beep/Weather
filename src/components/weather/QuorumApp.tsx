import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Locate, Moon, Search, Sun } from "lucide-react";
import { ConditionIcon } from "@/components/weather/ConditionIcon";
import { loadBriefing, reversePlace, searchPlaces } from "@/lib/weather/briefing";
import { CONDITION_LABEL, consensusCondition } from "@/lib/weather/conditions";
import { activeSources, agreementFor, buildChart, buildDays, chartHours } from "@/lib/weather/consensus";
import {
  cardinal,
  formatPercent,
  formatPrecip,
  formatPressure,
  formatTemp,
  formatWind,
  median,
} from "@/lib/weather/format";
import {
  LONDON,
  SUGGESTED,
  cityGuessFromTimezone,
  placeFromTimezone,
  readRecentPlaces,
  readSavedPlace,
  readSavedTheme,
  readSavedUnits,
  rememberPlace,
  saveTheme,
  saveUnits,
  type ThemeChoice,
} from "@/lib/weather/places";
import { formatClock, formatDayName, formatHourTick, formatHourTip, formatLongDate, hourKeyNow, todayKey } from "@/lib/weather/time";
import type { Briefing, Place, SourceForecast, Units } from "@/lib/weather/types";
import type { HourlyChart } from "@/components/weather/HourlyChart";
import type { RadarMap } from "@/components/weather/RadarMap";

function applyTheme(next: ThemeChoice) {
  document.documentElement.dataset.theme = next;
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", paper);
}

export function QuorumApp() {
  const [place, setPlace] = useState<Place | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [phase, setPhase] = useState<"boot" | "loading" | "ready" | "error">("boot");
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Units>("c");
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [theme, setTheme] = useState<ThemeChoice | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [Chart, setChart] = useState<typeof HourlyChart | null>(null);
  const [MapView, setMapView] = useState<typeof RadarMap | null>(null);

  useLayoutEffect(() => {
    const next = readSavedTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(next);
    setTheme(next);
  }, []);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("./HourlyChart").then((mod) => {
      if (!cancelled) setChart(() => mod.HourlyChart);
    });
    import("./RadarMap").then((mod) => {
      if (!cancelled) setMapView(() => mod.RadarMap);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = readSavedPlace();
      if (saved) {
        if (!cancelled) setPlace(saved);
        return;
      }
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const known = placeFromTimezone(zone);
      if (known) {
        if (!cancelled) {
          rememberPlace(known);
          setPlace(known);
        }
        return;
      }
      const guess = cityGuessFromTimezone(zone);
      if (!guess) {
        if (!cancelled) setPlace(LONDON);
        return;
      }
      try {
        const found = await searchPlaces({ data: { query: guess } });
        const hit = found.results.find((item) => item.timezone === zone) ?? found.results[0];
        if (!cancelled) setPlace(hit ?? LONDON);
      } catch {
        if (!cancelled) setPlace(LONDON);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!place) return;
    const saved = readSavedUnits();
    if (saved) {
      setUnits(saved);
      return;
    }
    const lang = navigator.language.toLowerCase();
    setUnits(place.countryCode === "US" || lang === "en-us" ? "f" : "c");
  }, [place]);

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    setPhase("loading");
    setBriefing(null);
    setError(null);
    loadBriefing({
      data: { latitude: place.latitude, longitude: place.longitude, timezone: place.timezone },
    })
      .then((data) => {
        if (cancelled) return;
        setBriefing(data);
        setEnabled(new Set(data.sources.filter((source) => source.status === "ok").map((source) => source.id)));
        setPhase(data.error ? "error" : "ready");
        setError(data.error);
      })
      .catch(() => {
        if (cancelled) return;
        setPhase("error");
        setError("The briefing didn't load.");
      });
    return () => {
      cancelled = true;
    };
  }, [place, reloadKey]);

  useEffect(() => {
    if (!place || !briefing) return;
    const dates = briefing.sources.flatMap((source) => source.days.map((day) => day.date));
    const unique = [...new Set(dates)].sort();
    const today = todayKey(place.timezone);
    setSelected((current) => {
      if (current && unique.includes(current)) return current;
      return unique.find((date) => date >= today) ?? unique[0] ?? null;
    });
  }, [briefing, place]);

  function choosePlace(next: Place) {
    rememberPlace(next);
    setPlace(next);
    setSelected(null);
  }

  function chooseUnits(next: Units) {
    setUnits(next);
    saveUnits(next);
  }

  function chooseTheme(next: ThemeChoice) {
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  }

  const today = place ? todayKey(place.timezone, now ?? new Date()) : "";
  const nowKey = place ? hourKeyNow(place.timezone, now ?? new Date()) : "";
  const sources = briefing?.sources ?? [];
  const days = buildDays(sources, enabled);
  const selectedDay = days.find((day) => day.date === selected) ?? null;
  const agreement = agreementFor(selectedDay?.spreadC ?? null, selectedDay?.reporting ?? 0, units);
  const hourKeys = chartHours(sources, enabled, selected, today, nowKey);
  const points = buildChart(sources, enabled, hourKeys, units, formatHourTip, formatHourTick);
  const offices = activeSources(sources, enabled);
  const anyOk = sources.some((source) => source.status === "ok");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="h-1 bg-accent" />
      <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <Mark />
            <div>
              <p className="font-display text-3xl leading-none tracking-tight">Quorum</p>
              <p className="mt-1 text-sm text-muted">Several forecasts, read together.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <SearchField onPick={choosePlace} />
            <div className="flex items-center gap-2">
              <div className="flex rounded-full bg-surface p-1 shadow-card" role="group" aria-label="Units">
                {(["f", "c"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={clsx(
                      "min-h-11 min-w-11 rounded-full px-3 text-sm font-medium",
                      units === option ? "bg-accent text-surface" : "text-muted",
                    )}
                    aria-pressed={units === option}
                    onClick={() => chooseUnits(option)}
                  >
                    °{option.toUpperCase()}
                  </button>
                ))}
              </div>
              <LocateButton onPick={choosePlace} />
              <ThemeButton theme={theme} onChoose={chooseTheme} />
            </div>
          </div>
        </header>

        {!place ? (
          <Boot onPick={choosePlace} />
        ) : (
          <>
            <Hero
              place={place}
              briefing={briefing}
              phase={phase}
              units={units}
              enabled={enabled}
              now={now}
              agreement={agreement}
            />

            {phase === "error" && !anyOk ? (
              <div className="desk-card mt-6 p-5">
                <p className="font-medium">{error || "The briefing didn't load."}</p>
                <button
                  type="button"
                  className="mt-4 min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-surface"
                  onClick={() => setReloadKey((n) => n + 1)}
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <DayStrip
                  days={days}
                  selected={selected}
                  today={today}
                  units={units}
                  loading={phase === "loading" && !briefing}
                  onSelect={setSelected}
                />

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
                  <section className="desk-card p-4 md:col-span-2 md:p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="font-display text-2xl tracking-tight">
                        {selected ? formatDayName(selected, today) : "Offices"}
                      </h2>
                      <p className="text-sm text-muted">{offices.length} in the reading</p>
                    </div>
                    <p className={clsx("mt-1 text-sm", agreement.tone === "wide" ? "text-warn" : "text-muted")}>
                      {agreement.label}. {agreement.detail}
                    </p>
                    <SpreadRail
                      day={selectedDay}
                      sources={sources}
                      enabled={enabled}
                      selected={selected}
                      units={units}
                    />
                    <ul className="mt-3 divide-y divide-line">
                      {sources.map((source) => (
                        <ModelRow
                          key={source.id}
                          source={source}
                          date={selected}
                          units={units}
                          on={enabled.has(source.id)}
                          onToggle={() => {
                            setEnabled((current) => {
                              const next = new Set(current);
                              if (next.has(source.id)) next.delete(source.id);
                              else next.add(source.id);
                              return next;
                            });
                          }}
                        />
                      ))}
                    </ul>
                    {phase === "loading" && !briefing ? <p className="mt-4 text-sm text-muted">Asking the offices…</p> : null}
                    <FeedNote sources={sources} />
                  </section>

                  <section className="desk-card min-w-0 p-4 md:col-span-3 md:p-5">
                    <h2 className="font-display text-2xl tracking-tight">
                      {!selected || selected === today ? "Coming hours" : `${formatDayName(selected, today)} by hour`}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      The line is the median. The band is how far the offices sit apart. Bars are the chance of precipitation.
                    </p>
                    <div className="mt-3">
                      {phase === "loading" && !briefing ? (
                        <div className="h-56 animate-pulse rounded-2xl bg-line" />
                      ) : Chart ? (
                        <Chart points={points} units={units} />
                      ) : (
                        <div className="h-56 rounded-2xl bg-line/60" />
                      )}
                    </div>
                  </section>
                </div>

                <section className="desk-card mt-4 p-3 md:p-4">
                  <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                    <h2 className="font-display text-2xl tracking-tight">Radar</h2>
                    <p className="text-sm text-muted">Echoes, not a forecast</p>
                  </div>
                  {MapView && place && theme ? (
                    <MapView latitude={place.latitude} longitude={place.longitude} timezone={place.timezone} theme={theme} />
                  ) : (
                    <div className="h-72 rounded-2xl bg-line/70 md:h-96" />
                  )}
                </section>
              </>
            )}
          </>
        )}

        <footer className="mt-8 pb-4 text-xs leading-relaxed text-muted">
          Global rows are ensemble means from ECMWF, NOAA GFS, DWD ICON, and Environment Canada GEM, via Open-Meteo.
          Also MET Norway and, in the United States, the National Weather Service. Radar from RainViewer. Map © Esri,
          © OpenStreetMap.
        </footer>
      </main>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-10 text-accent" aria-hidden="true">
      <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="2.4" className="fill-ink" />
    </svg>
  );
}

function Boot({ onPick }: { onPick: (place: Place) => void }) {
  return (
    <section className="mt-10">
      <h1 className="font-display text-4xl tracking-tight">Where should we look?</h1>
      <p className="mt-2 max-w-md text-muted">A city from your clock is on the way. Or start with one of these.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTED.map((city) => (
          <CityChip key={city.id} city={city} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

function CityChip({ city, onPick }: { city: Place; onPick: (place: Place) => void }) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-full bg-surface px-4 text-sm shadow-card"
      onClick={() => onPick(city)}
    >
      {city.name}
    </button>
  );
}

function Hero({
  place,
  briefing,
  phase,
  units,
  enabled,
  now,
  agreement,
}: {
  place: Place;
  briefing: Briefing | null;
  phase: "boot" | "loading" | "ready" | "error";
  units: Units;
  enabled: Set<string>;
  now: Date | null;
  agreement: ReturnType<typeof agreementFor>;
}) {
  const obs = briefing?.observation ?? null;
  const spots = (briefing?.sources ?? []).filter(
    (source) => source.status === "ok" && enabled.has(source.id) && source.spot?.tempC != null,
  );
  const temps = spots.map((source) => source.spot?.tempC).filter((value): value is number => value != null);
  const heroTemp = obs?.tempC ?? median(temps);
  const heroCondition = obs?.condition ?? consensusCondition(spots.map((source) => source.spot?.condition ?? "unknown"));
  const met = briefing?.sources.find((source) => source.id === "metno")?.spot ?? null;
  const humidity = obs?.humidity ?? met?.humidity ?? null;
  const wind = obs?.windKmh ?? met?.windKmh ?? median(spots.map((s) => s.spot?.windKmh).filter((v): v is number => v != null));
  const windDeg = obs?.windDeg ?? met?.windDeg ?? null;
  const pressure = obs?.pressureHpa ?? met?.pressureHpa ?? null;
  const lo = temps.length ? Math.min(...temps) : null;
  const hi = temps.length ? Math.max(...temps) : null;
  const where = [place.admin, place.country].filter(Boolean).join(", ");

  return (
    <section className="mt-8" aria-live="polite">
      <p className="text-sm text-muted">{where}</p>
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">{place.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {now ? `${formatLongDate(now, place.timezone)} · ${formatClock(now, place.timezone)}` : "Loading the local clock"}
      </p>

      {phase === "loading" && !briefing ? (
        <div className="mt-6 h-24 w-48 animate-pulse rounded-2xl bg-line" />
      ) : (
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <p className="font-display text-7xl leading-none tracking-tight tabular-nums md:text-8xl">
              {formatTemp(heroTemp, units)}
            </p>
            <div className="pb-2">
              <p className="flex items-center gap-2 text-lg">
                <ConditionIcon condition={heroCondition} className="size-6" />
                {CONDITION_LABEL[heroCondition]}
              </p>
              <p className="text-sm text-muted">
                {obs ? `Observed · ${shortStation(obs.station)}` : `Median of ${temps.length} forecasts`}
              </p>
            </div>
          </div>
          <div
            className={clsx(
              "rounded-full px-3 py-2 text-sm",
              agreement.tone === "wide" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent",
            )}
          >
            {agreement.label}
          </div>
        </div>
      )}

      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-muted">Wind</dt>
          <dd className="tabular-nums">
            {formatWind(wind, units)} {cardinal(windDeg)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Humidity</dt>
          <dd className="tabular-nums">{formatPercent(humidity)}</dd>
        </div>
        <div>
          <dt className="text-muted">Pressure</dt>
          <dd className="tabular-nums">{formatPressure(pressure, units)}</dd>
        </div>
      </dl>
      {obs && lo != null && hi != null && Math.abs(hi - lo) >= 0.4 ? (
        <p className="mt-3 text-sm text-muted">
          Forecasts this hour run {formatTemp(lo, units)} to {formatTemp(hi, units)}.
        </p>
      ) : null}
    </section>
  );
}

function shortStation(name: string): string {
  const cut = name.split(",")[0]?.trim();
  return cut || name;
}

function DayStrip({
  days,
  selected,
  today,
  units,
  loading,
  onSelect,
}: {
  days: ReturnType<typeof buildDays>;
  selected: string | null;
  today: string;
  units: Units;
  loading: boolean;
  onSelect: (date: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-28 w-20 shrink-0 animate-pulse rounded-2xl bg-line" />
        ))}
      </div>
    );
  }
  if (!days.length) return null;
  return (
    <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
      {days.map((day) => {
        const on = day.date === selected;
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelect(day.date)}
            className={clsx(
              "flex w-20 shrink-0 flex-col items-start gap-1 rounded-2xl px-3 py-3 text-left",
              on ? "bg-accent text-surface" : "bg-surface text-ink shadow-card",
            )}
            aria-pressed={on}
          >
            <span className={clsx("text-xs", on ? "text-surface/80" : "text-muted")}>{formatDayName(day.date, today)}</span>
            <ConditionIcon condition={day.condition} className="size-5" />
            <span className="text-lg leading-none tabular-nums">{formatTemp(day.highC, units)}</span>
            <span className={clsx("text-sm tabular-nums", on ? "text-surface/80" : "text-muted")}>
              {formatTemp(day.lowC, units)}
            </span>
            <span className={clsx("text-xs tabular-nums", on ? "text-surface/80" : "text-muted")}>
              {day.precipProb != null ? formatPercent(day.precipProb) : formatPrecip(day.precipMm, units)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SpreadRail({
  day,
  sources,
  enabled,
  selected,
  units,
}: {
  day: ReturnType<typeof buildDays>[number] | null;
  sources: SourceForecast[];
  enabled: Set<string>;
  selected: string | null;
  units: Units;
}) {
  if (!day || !selected || day.highC == null) return null;
  const ticks = sources
    .filter((source) => source.status === "ok" && enabled.has(source.id))
    .map((source) => {
      const row = source.days.find((item) => item.date === selected);
      return row?.highC == null ? null : { id: source.id, value: row.highC };
    })
    .filter((tick): tick is { id: string; value: number } => tick != null);
  if (ticks.length < 2) return null;
  const values = ticks.map((tick) => tick.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high - low < 0.4) return null;
  const pct = (value: number) => ((value - low) / (high - low)) * 100;
  return (
    <div className="mt-4">
      <div className="relative h-8">
        <div className="absolute top-1/2 right-0 left-0 h-px bg-line" />
        {ticks.map((tick) => (
          <span
            key={tick.id}
            className="absolute top-2 h-4 w-px bg-ink/50"
            style={{ left: `${pct(tick.value)}%`, transform: "translateX(-50%)" }}
          />
        ))}
        <span
          className="absolute top-1 z-10 h-6 w-0.5 rounded-full bg-accent"
          style={{ left: `${pct(day.highC)}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{formatTemp(low, units)}</span>
        <span>Highs</span>
        <span>{formatTemp(high, units)}</span>
      </div>
    </div>
  );
}

function ModelRow({
  source,
  date,
  units,
  on,
  onToggle,
}: {
  source: SourceForecast;
  date: string | null;
  units: Units;
  on: boolean;
  onToggle: () => void;
}) {
  const day = source.days.find((item) => item.date === date) ?? null;
  const ok = source.status === "ok";
  const body = (
    <>
      <span
        className={clsx(
          "mt-1 size-3 shrink-0 rounded-full border",
          ok && on ? "border-accent bg-accent" : "border-line bg-transparent",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{source.label}</span>
          <span className="tabular-nums">
            {ok && day ? `${formatTemp(day.highC, units)} / ${formatTemp(day.lowC, units)}` : "—"}
          </span>
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-muted">
          <span>
            {source.agency}
            {source.members && source.members > 1 ? ` · ${source.members} members` : ""}
          </span>
          <span className="tabular-nums">
            {ok && day
              ? day.precipProb != null
                ? formatPercent(day.precipProb)
                : formatPrecip(day.precipMm, units)
              : (source.note ?? "—")}
          </span>
        </span>
        {ok && day && day.highMinC != null && day.highMaxC != null && day.highMaxC - day.highMinC >= 0.6 ? (
          <span className="mt-0.5 block text-xs text-muted tabular-nums">
            Member highs {formatTemp(day.highMinC, units)}–{formatTemp(day.highMaxC, units)}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!ok) {
    return <li className="flex gap-3 py-3 opacity-70">{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        className={clsx("flex w-full gap-3 py-3 text-left", on ? "" : "opacity-45")}
        aria-pressed={on}
        onClick={onToggle}
      >
        {body}
      </button>
    </li>
  );
}

function FeedNote({ sources }: { sources: SourceForecast[] }) {
  const globals = sources.filter((source) => ["ecmwf", "gfs", "icon", "gem"].includes(source.id));
  const down = globals.filter((source) => source.status !== "ok");
  if (!down.length) return null;
  const text =
    down.length === globals.length
      ? "The global ensembles didn't answer. National forecasts are still in the reading."
      : `${down.map((source) => source.label).join(", ")} didn't report for this place.`;
  return <p className="mt-3 text-sm text-warn">{text}</p>;
}

function SearchField({ onPick }: { onPick: (place: Place) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [recent, setRecent] = useState<Place[]>([]);
  const [pending, setPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(readRecentPlaces());
  }, []);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    const timer = window.setTimeout(() => {
      searchPlaces({ data: { query: trimmed } })
        .then((res) => {
          if (cancelled) return;
          setResults(res.results);
          setSearchError(res.error);
          setPending(false);
        })
        .catch(() => {
          if (cancelled) return;
          setPending(false);
          setSearchError("Search didn't answer.");
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const list = query.trim().length < 2 ? recent : results;
  const show = Boolean(open && (list.length > 0 || pending || searchError || query.trim().length >= 2));

  return (
    <div ref={boxRef} className="relative w-full md:w-80">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search a city"
        aria-label="Search a city"
        className="h-11 w-full rounded-full bg-surface pr-4 pl-10 text-base text-ink shadow-card outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
      />
      {show ? (
        <ul className="desk-card absolute top-12 right-0 left-0 z-30 max-h-72 overflow-auto p-1" role="listbox">
          {pending ? <li className="px-3 py-2 text-sm text-muted">Searching…</li> : null}
          {searchError ? <li className="px-3 py-2 text-sm text-warn">{searchError}</li> : null}
          {!pending && !searchError && query.trim().length >= 2 && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No matches. Try a shortcut city.</li>
          ) : null}
          {query.trim().length < 2 && recent.length > 0 ? (
            <li className="px-3 pt-2 text-xs text-muted">Recent</li>
          ) : null}
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-col items-start justify-center rounded-xl px-3 py-2 text-left hover:bg-accent-soft"
                onClick={() => {
                  onPick(item);
                  setQuery("");
                  setOpen(false);
                  setRecent(readRecentPlaces());
                }}
              >
                <span>{item.name}</span>
                <span className="text-sm text-muted">{[item.admin, item.country].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
          {query.trim().length < 2 && recent.length === 0
            ? SUGGESTED.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-accent-soft"
                    onClick={() => {
                      onPick(item);
                      setOpen(false);
                    }}
                  >
                    {item.name}
                  </button>
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </div>
  );
}

function ThemeButton({ theme, onChoose }: { theme: ThemeChoice | null; onChoose: (next: ThemeChoice) => void }) {
  return (
    <button
      type="button"
      className="flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-card"
      aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
      aria-pressed={theme === "dark"}
      disabled={!theme}
      onClick={() => theme && onChoose(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function LocateButton({ onPick }: { onPick: (place: Place) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-card"
        aria-label="Use my location"
        disabled={busy}
        onClick={() => {
          setMessage(null);
          if (!navigator.geolocation) {
            setMessage("Location isn't available in this browser.");
            return;
          }
          setBusy(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              void reversePlace({
                data: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
              })
                .then((found) => {
                  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
                  onPick(
                    found
                      ? { ...found, timezone }
                      : {
                          id: `here:${pos.coords.latitude.toFixed(3)},${pos.coords.longitude.toFixed(3)}`,
                          name: "Your location",
                          admin: "",
                          country: "",
                          countryCode: "",
                          latitude: pos.coords.latitude,
                          longitude: pos.coords.longitude,
                          timezone,
                        },
                  );
                })
                .finally(() => setBusy(false));
            },
            () => {
              setBusy(false);
              setMessage("Location permission was denied.");
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
          );
        }}
      >
        <Locate className={clsx("size-4", busy && "animate-pulse")} />
      </button>
      {message ? (
        <p className="absolute top-12 right-0 z-30 w-48 rounded-xl bg-surface px-3 py-2 text-sm text-warn shadow-card">
          {message}
        </p>
      ) : null}
    </div>
  );
}
