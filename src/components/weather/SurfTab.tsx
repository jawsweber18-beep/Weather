import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Waves } from "lucide-react";
import { loadSurf } from "@/lib/weather/surf";
import {
  formatWaveHeight,
  formatWavePeriod,
  isSurfToday,
  surfQuality,
  surfQualityLabel,
  waveDirection,
} from "@/lib/weather/surf-core";
import { formatDayName, todayKey } from "@/lib/weather/time";
import type { Place, SurfBriefing, Units } from "@/lib/weather/types";

type SurfDay = SurfBriefing["days"][number];

const QUALITY_TONE: Record<string, string> = {
  none: "bg-line text-muted",
  flat: "bg-line text-muted",
  small: "bg-accent-soft text-accent",
  good: "bg-accent text-surface",
  large: "bg-accent text-surface",
  big: "bg-accent text-surface",
};

export function SurfTab({ place, units }: { place: Place; units: Units }) {
  const [briefing, setBriefing] = useState<SurfBriefing | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setBriefing(null);
    loadSurf({ data: { latitude: place.latitude, longitude: place.longitude, timezone: place.timezone } })
      .then((data) => {
        if (cancelled) return;
        setBriefing(data);
        setPhase(data.error && !data.days.length ? "error" : "ready");
      })
      .catch(() => {
        if (cancelled) return;
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [place, reloadKey]);

  if (phase === "error" && !briefing?.days.length) {
    return (
      <section className="desk-card mt-8 p-5">
        <p className="flex items-center gap-2 font-medium">
          <Waves className="size-5" />
          {briefing?.error || "The wave service didn't answer."}
        </p>
        <button
          type="button"
          className="mt-4 min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-surface"
          onClick={() => setReloadKey((n) => n + 1)}
        >
          Try again
        </button>
      </section>
    );
  }

  const spot = briefing?.spot ?? null;
  const days = briefing?.days ?? [];
  const today = todayKey(place.timezone);

  return (
    <section className="mt-8" aria-live="polite">
      <h2 className="font-display text-2xl tracking-tight">Surf</h2>
      <p className="mt-1 text-sm text-muted">Swell height, period and direction from {briefing?.source || "the wave model"}.</p>

      {spot ? (
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <p className="font-display text-7xl leading-none tracking-tight tabular-nums md:text-8xl">
              {formatWaveHeight(spot.heightM, units)}
            </p>
            <div className="pb-2">
              <p className="flex items-center gap-2 text-lg">
                <Waves className="size-5" />
                {surfQualityLabel(surfQuality(spot.heightM))} swell
              </p>
              <p className="text-sm text-muted">
                {formatWavePeriod(spot.periodS)} period
                {spot.directionDeg != null ? ` · ${waveDirection(spot.directionDeg)}` : ""}
              </p>
            </div>
          </div>
          <QualityBadge quality={surfQuality(spot.heightM)} />
        </div>
      ) : phase === "loading" ? (
        <div className="mt-6 h-24 w-48 animate-pulse rounded-2xl bg-line" />
      ) : (
        <p className="mt-6 text-sm text-muted">No swell reading for this spot.</p>
      )}

      {days.length > 0 ? (
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {days.map((day) => (
            <SurfDayCard key={day.date} day={day} units={units} today={today} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SurfDayCard({ day, units, today }: { day: SurfDay; units: Units; today?: string }) {
  const quality = surfQuality(day.heightM);
  const on = isSurfToday(day.date, today);
  return (
    <div
      className={clsx(
        "flex w-28 shrink-0 flex-col items-start gap-1 rounded-2xl px-3 py-3",
        on ? "ring-2 ring-accent" : "",
      )}
    >
      <span className="text-xs text-muted">{formatDayName(day.date, today ?? day.date)}</span>
      <span className="text-lg leading-none tabular-nums">{formatWaveHeight(day.heightM, units)}</span>
      <span className="text-sm tabular-nums text-muted">
        {formatWavePeriod(day.periodS)}
        {day.directionDeg != null ? ` · ${waveDirection(day.directionDeg)}` : ""}
      </span>
      <span className={clsx("mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium", QUALITY_TONE[quality] ?? QUALITY_TONE.none)}>
        {surfQualityLabel(quality)}
      </span>
    </div>
  );
}

function QualityBadge({ quality }: { quality: string }) {
  return (
    <span className={clsx("inline-flex rounded-full px-3 py-2 text-sm font-medium", QUALITY_TONE[quality] ?? QUALITY_TONE.none)}>
      {surfQualityLabel(quality)} surf
    </span>
  );
}
