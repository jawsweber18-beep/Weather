export type SwellComponent = {
  heightM: number | null;
  periodS: number | null;
  directionDeg: number | null;
  directionCardinal: string;
};

export type SurfSpot = {
  waveHeightM: number | null;
  wavePeriodS: number | null;
  waveDirectionDeg: number | null;
  dominantSwellDirection: string | null;
  swellComponents: SwellComponent[];
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
};

export type SurfDayPoint = {
  date: string;
  avgHeightM: number | null;
  avgPeriodS: number | null;
  dominantDirection: string;
  score: number | null; // 1-10 quality score
  swellCount: number;
};

export type SurfBriefing = {
  error: string | null;
  generatedAt: string;
  spot: SurfSpot | null;
  days: SurfDayPoint[];
};
