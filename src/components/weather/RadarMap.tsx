import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { CircleMarker, Map as LeafletMap, TileLayer } from "leaflet";
import { loadRadar } from "@/lib/weather/briefing";
import { formatRadarTime } from "@/lib/weather/time";
import type { ThemeChoice } from "@/lib/weather/places";
import type { RadarFrame } from "@/lib/weather/types";

type LeafletModule = typeof import("leaflet");

const BASE: Record<ThemeChoice, string> = {
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
};

const LABELS: Record<ThemeChoice, string> = {
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
};

async function loadLeaflet(): Promise<LeafletModule> {
  const imported = (await import("leaflet")) as LeafletModule & { default?: LeafletModule };
  return imported.default ?? imported;
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function RadarMap({
  latitude,
  longitude,
  timezone,
  theme,
}: {
  latitude: number;
  longitude: number;
  timezone: string;
  theme: ThemeChoice;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseRef = useRef<TileLayer | null>(null);
  const radarRef = useRef<TileLayer | null>(null);
  const labelRef = useRef<TileLayer | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [host, setHost] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    let cancelled = false;
    let map: LeafletMap | null = null;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled) return;
      leafletRef.current = L;
      const mode = themeRef.current;
      map = L.map(el, { scrollWheelZoom: false, zoomControl: true, fadeAnimation: false });
      map.setView([latitude, longitude], 5);
      map.createPane("labels");
      const labelsPane = map.getPane("labels");
      if (labelsPane) {
        labelsPane.style.zIndex = "350";
        labelsPane.style.pointerEvents = "none";
      }
      map.createPane("radar");
      const radarPane = map.getPane("radar");
      if (radarPane) radarPane.style.zIndex = "450";
      baseRef.current = L.tileLayer(BASE[mode], {
        maxZoom: 12,
        attribution: "&copy; Esri &copy; OpenStreetMap",
      }).addTo(map);
      markerRef.current = L.circleMarker([latitude, longitude], {
        radius: 7,
        color: cssColor("--color-surface", "#fbf7ef"),
        weight: 3,
        fillColor: cssColor("--color-accent", "#0f6e62"),
        fillOpacity: 1,
      }).addTo(map);
      mapRef.current = map;
      radarRef.current = null;
      labelRef.current = L.tileLayer(LABELS[mode], { maxZoom: 12, pane: "labels" }).addTo(map);
      setReady((n) => n + 1);
      window.setTimeout(() => map?.invalidateSize(), 60);
    })().catch(() => {
      if (!cancelled) setError("The map didn't start.");
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      baseRef.current = null;
      radarRef.current = null;
      labelRef.current = null;
      markerRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    baseRef.current?.setUrl(BASE[theme]);
    labelRef.current?.setUrl(LABELS[theme]);
    markerRef.current?.setStyle({
      color: cssColor("--color-surface", "#fbf7ef"),
      fillColor: cssColor("--color-accent", "#0f6e62"),
    });
  }, [theme, ready]);

  useEffect(() => {
    let cancelled = false;
    loadRadar()
      .then((pack) => {
        if (cancelled) return;
        setHost(pack.host);
        setFrames(pack.frames);
        setError(pack.error);
        const pastCount = pack.frames.filter((frame) => frame.kind === "past").length;
        setIndex(pastCount > 0 ? pastCount - 1 : 0);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setPlaying(!reduce && pack.frames.length > 1);
      })
      .catch(() => {
        if (!cancelled) setError("Radar didn't answer.");
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const frame = frames[index];
    if (!L || !map || !frame || !host) return;
    const url = `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    if (!radarRef.current) {
      radarRef.current = L.tileLayer(url, {
        pane: "radar",
        opacity: 0.95,
        maxZoom: 12,
        maxNativeZoom: 7,
      }).addTo(map);
    } else {
      radarRef.current.setUrl(url);
    }
  }, [frames, index, host, ready]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, 800);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  const frame = frames[index];

  return (
    <div>
      <div className="relative h-72 overflow-hidden rounded-2xl md:h-96">
        <div className="absolute inset-0">
          <div ref={frameRef} className="h-full w-full" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-surface"
          aria-label={playing ? "Pause radar" : "Play radar"}
          onClick={() => setPlaying((value) => !value)}
          disabled={frames.length < 2}
        >
          {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
        </button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={Math.min(index, Math.max(0, frames.length - 1))}
          aria-label="Radar time"
          disabled={!frames.length}
          onChange={(event) => {
            setPlaying(false);
            setIndex(Number(event.target.value));
          }}
        />
        <p className="w-28 shrink-0 text-right text-sm text-muted tabular-nums">
          {frame ? formatRadarTime(frame.time, timezone) : "—"}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {error
          ? error
          : frame?.kind === "nowcast"
            ? "Short-range radar nowcast — extrapolated echoes, not a model."
            : "RainViewer radar mosaic. Drag the map, or play the last few hours."}
      </p>
    </div>
  );
}