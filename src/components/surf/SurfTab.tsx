import { useEffect, useState } from "react";
import type { Place, BriefingInput } from "@/lib/weather/types";
import type { SurfBriefing } from "@/lib/surf/types";
import { loadSurf } from "@/lib/surf/briefing";

interface SurfTabProps {
  place: Place;
  loaded?: boolean;
}

export function SurfTab({ place, loaded }: SurfTabProps) {
  const [surfData, setSurfData] = useState<SurfBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSurf() {
      try {
        setLoading(true);
        const input: BriefingInput = {
          latitude: place.latitude,
          longitude: place.longitude,
          timezone: place.timezone,
        };

        const data = await loadSurf({ data: input });

        if (!cancelled) {
          setSurfData(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load surf data");
          setSurfData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSurf();

    return () => {
      cancelled = true;
    };
  }, [place]);

  const formatHeight = (heightM: number | null): string => {
    if (heightM == null) return "N/A";
    return `${heightM.toFixed(1)}m`;
  };

  const getScoreColor = (score: number | null): string => {
    if (score == null) return "text-gray-400 dark:text-gray-500";
    if (score >= 7) return "text-green-600 dark:text-green-400";
    if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (loading && !loaded) {
    return (
      <section className="desk-card mt-4 min-w-0 p-4 md:p-5">
        <h2 className="font-display text-2xl tracking-tight">Surf Forecast</h2>
        <div className="mt-6 animate-pulse space-y-3">
          <div className="flex gap-4">
            <div className="h-16 flex-1 rounded-xl bg-line" />
            <div className="h-16 flex-1 rounded-xl bg-line" />
            <div className="h-16 flex-1 rounded-xl bg-line" />
          </div>
          <div className="h-40 space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-10 rounded-lg bg-line" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error && !surfData?.spot) {
    return (
      <section className="desk-card mt-4 min-w-0 p-4 md:p-5">
        <h2 className="font-display text-2xl tracking-tight">Surf Forecast</h2>
        <div className="mt-4 py-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <p className="mt-1 text-sm text-muted">This location may be too far from the coast</p>
        </div>
      </section>
    );
  }

  if (!surfData || !surfData.spot) {
    return null;
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <section className="desk-card mt-4 min-w-0 p-4 md:p-5">
      <h2 className="font-display text-2xl tracking-tight">Surf Forecast</h2>

      {/* Current Conditions */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface rounded-lg p-4 shadow-card">
          <div className="text-sm text-muted mb-1">Wave Height</div>
          <div className="text-2xl font-bold tabular-nums">{formatHeight(surfData.spot.waveHeightM)}</div>
        </div>

        <div className="bg-surface rounded-lg p-4 shadow-card">
          <div className="text-sm text-muted mb-1">Wave Period</div>
          <div className="text-2xl font-bold tabular-nums">{surfData.spot.wavePeriodS != null ? `${surfData.spot.wavePeriodS}s` : "N/A"}</div>
        </div>

        <div className="bg-surface rounded-lg p-4 shadow-card">
          <div className="text-sm text-muted mb-1">Quality Score</div>
          <div className={`text-2xl font-bold ${getScoreColor(estimateSpotScore(surfData.spot))}`}>
            {estimateSpotScore(surfData.spot) > 0 ? `${estimateSpotScore(surfData.spot)}/10` : "N/A"}
          </div>
        </div>
      </div>

      {/* Swell Components */}
      <div className="mt-4">
        <h3 className="font-medium text-sm text-muted mb-2">Swell Components</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {surfData.spot.swellComponents.map((swell, idx) => (
            <div key={idx} className="bg-surface rounded-lg p-3 shadow-card text-sm">
              <div className="font-medium mb-1">Swell {idx + 1}</div>
              <div className="text-muted">Height: {swell.heightM != null ? `${swell.heightM.toFixed(1)}m` : "N/A"}</div>
              <div className="text-muted">Period: {swell.periodS != null ? `${swell.periodS}s` : "N/A"}</div>
              <div className="text-muted">Direction: {swell.directionCardinal}°</div>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div className="mt-6">
        <h3 className="font-medium text-lg mb-3">7-Day Forecast</h3>
        <div className="space-y-2">
          {surfData.days.map((day) => (
            <div
              key={day.date}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg transition-colors ${
                day.date === today
                  ? "bg-accent text-surface"
                  : "bg-surface hover:bg-surface/80 shadow-card"
              }`}
            >
              <div className="flex items-center gap-3 mb-1 sm:mb-0">
                <span
                  className={`font-medium w-24 ${day.date === today ? "text-surface/90" : "text-ink"}`}
                >
                  {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {formatHeight(day.avgHeightM)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className={day.date === today ? "text-surface/80" : "text-muted"}>
                  Period: {day.avgPeriodS != null ? `${day.avgPeriodS}s` : "N/A"}
                </span>
                <span className={day.date === today ? "text-surface/80" : "text-muted"}>
                  Dir: {day.dominantDirection}
                </span>
                <span className={`font-bold tabular-nums ${getScoreColor(day.score)}`}>
                  {day.score != null ? `${day.score}/10` : "N/A"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-4 text-xs text-muted">
        <p>Surf data provided by Stormglass API. Quality scores are estimates based on wave height and period.</p>
      </div>
    </section>
  );
}

/**
 * Quick heuristic for the current spot's quality score (derived from spot-level data).
 */
function estimateSpotScore(spot: SurfBriefing["spot"]): number | null {
  if (!spot) return null;
  let score = 0;
  const h = spot.waveHeightM;
  const p = spot.wavePeriodS;

  if (h != null && h >= 0.5 && h <= 4.0) score += 4;
  else if (h != null && h > 4.0 && h <= 6.0) score += 2;

  if (p != null && p >= 10) score += 3;
  else if (p != null && p >= 7) score += 2;
  else if (p != null && p >= 5) score += 1;

  return Math.min(score, 10);
}
