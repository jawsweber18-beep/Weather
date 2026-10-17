export type Condition =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder"
  | "unknown";

export type Units = "f" | "c";

export type Place = {
  id: string;
  name: string;
  admin: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type Spot = {
  tempC: number | null;
  humidity: number | null;
  windKmh: number | null;
  windDeg: number | null;
  pressureHpa: number | null;
  condition: Condition;
};

export type DayPoint = {
  date: string;
  highC: number | null;
  lowC: number | null;
  highMinC: number | null;
  highMaxC: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windKmh: number | null;
  condition: Condition;
};

export type HourPoint = {
  time: string;
  tempC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windKmh: number | null;
  condition: Condition;
};

export type SourceForecast = {
  id: string;
  label: string;
  agency: string;
  members: number | null;
  status: "ok" | "unavailable" | "error";
  note: string | null;
  days: DayPoint[];
  hours: HourPoint[];
  spot: Spot | null;
};

export type Observation = {
  tempC: number;
  humidity: number | null;
  windKmh: number | null;
  windDeg: number | null;
  pressureHpa: number | null;
  condition: Condition;
  text: string;
  at: string;
  station: string;
};

export type Briefing = {
  error: string | null;
  generatedAt: string;
  sources: SourceForecast[];
  observation: Observation | null;
};

export type RadarFrame = {
  time: number;
  path: string;
  kind: "past" | "nowcast";
};

export type RadarPack = {
  host: string;
  frames: RadarFrame[];
  error: string | null;
};

export type BriefingInput = {
  latitude: number;
  longitude: number;
  timezone: string;
};
