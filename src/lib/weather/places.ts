import type { Place } from "./types";

function place(
  id: string,
  name: string,
  admin: string,
  country: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  timezone: string,
): Place {
  return { id, name, admin, country, countryCode, latitude, longitude, timezone };
}

export const NEW_YORK = place("5128581", "New York", "New York", "United States", "US", 40.7128, -74.006, "America/New_York");
export const LONDON = place("2643743", "London", "England", "United Kingdom", "GB", 51.5072, -0.1276, "Europe/London");
export const CHICAGO = place("4887398", "Chicago", "Illinois", "United States", "US", 41.8781, -87.6298, "America/Chicago");
export const LOS_ANGELES = place("5368361", "Los Angeles", "California", "United States", "US", 34.0522, -118.2437, "America/Los_Angeles");
export const DENVER = place("5419384", "Denver", "Colorado", "United States", "US", 39.7392, -104.9903, "America/Denver");
export const TOKYO = place("1850147", "Tokyo", "Tokyo", "Japan", "JP", 35.6762, 139.6503, "Asia/Tokyo");
export const SYDNEY = place("2147714", "Sydney", "New South Wales", "Australia", "AU", -33.8688, 151.2093, "Australia/Sydney");

export const SUGGESTED: Place[] = [NEW_YORK, LONDON, CHICAGO, LOS_ANGELES, TOKYO, SYDNEY];

const KNOWN: Record<string, Place> = {
  "America/New_York": NEW_YORK,
  "America/Detroit": place("4990729", "Detroit", "Michigan", "United States", "US", 42.3314, -83.0458, "America/Detroit"),
  "America/Chicago": CHICAGO,
  "America/Denver": DENVER,
  "America/Boise": place("5586437", "Boise", "Idaho", "United States", "US", 43.615, -116.2023, "America/Boise"),
  "America/Phoenix": place("5308655", "Phoenix", "Arizona", "United States", "US", 33.4484, -112.074, "America/Phoenix"),
  "America/Los_Angeles": LOS_ANGELES,
  "America/Anchorage": place("5879400", "Anchorage", "Alaska", "United States", "US", 61.2181, -149.9003, "America/Anchorage"),
  "Pacific/Honolulu": place("5856195", "Honolulu", "Hawaii", "United States", "US", 21.3069, -157.8583, "Pacific/Honolulu"),
  "America/Toronto": place("6167865", "Toronto", "Ontario", "Canada", "CA", 43.6532, -79.3832, "America/Toronto"),
  "America/Vancouver": place("6173331", "Vancouver", "British Columbia", "Canada", "CA", 49.2827, -123.1207, "America/Vancouver"),
  "America/Mexico_City": place("3530597", "Mexico City", "Mexico City", "Mexico", "MX", 19.4326, -99.1332, "America/Mexico_City"),
  "America/Sao_Paulo": place("3448439", "São Paulo", "São Paulo", "Brazil", "BR", -23.5505, -46.6333, "America/Sao_Paulo"),
  "America/Argentina/Buenos_Aires": place("3435910", "Buenos Aires", "Buenos Aires", "Argentina", "AR", -34.6037, -58.3816, "America/Argentina/Buenos_Aires"),
  "Europe/London": LONDON,
  "Europe/Dublin": place("2964574", "Dublin", "Leinster", "Ireland", "IE", 53.3498, -6.2603, "Europe/Dublin"),
  "Europe/Lisbon": place("2267057", "Lisbon", "Lisbon", "Portugal", "PT", 38.7223, -9.1393, "Europe/Lisbon"),
  "Europe/Paris": place("2988507", "Paris", "Île-de-France", "France", "FR", 48.8566, 2.3522, "Europe/Paris"),
  "Europe/Madrid": place("3117735", "Madrid", "Madrid", "Spain", "ES", 40.4168, -3.7038, "Europe/Madrid"),
  "Europe/Rome": place("3169070", "Rome", "Lazio", "Italy", "IT", 41.9028, 12.4964, "Europe/Rome"),
  "Europe/Berlin": place("2950159", "Berlin", "Berlin", "Germany", "DE", 52.52, 13.405, "Europe/Berlin"),
  "Europe/Amsterdam": place("2759794", "Amsterdam", "North Holland", "Netherlands", "NL", 52.3676, 4.9041, "Europe/Amsterdam"),
  "Europe/Stockholm": place("2673730", "Stockholm", "Stockholm", "Sweden", "SE", 59.3293, 18.0686, "Europe/Stockholm"),
  "Europe/Warsaw": place("756135", "Warsaw", "Masovia", "Poland", "PL", 52.2297, 21.0122, "Europe/Warsaw"),
  "Europe/Athens": place("264371", "Athens", "Attica", "Greece", "GR", 37.9838, 23.7275, "Europe/Athens"),
  "Asia/Tokyo": TOKYO,
  "Asia/Seoul": place("1835848", "Seoul", "Seoul", "South Korea", "KR", 37.5665, 126.978, "Asia/Seoul"),
  "Asia/Shanghai": place("1796236", "Shanghai", "Shanghai", "China", "CN", 31.2304, 121.4737, "Asia/Shanghai"),
  "Asia/Hong_Kong": place("1819729", "Hong Kong", "Hong Kong", "Hong Kong", "HK", 22.3193, 114.1694, "Asia/Hong_Kong"),
  "Asia/Singapore": place("1880252", "Singapore", "Singapore", "Singapore", "SG", 1.3521, 103.8198, "Asia/Singapore"),
  "Asia/Kolkata": place("1275004", "Kolkata", "West Bengal", "India", "IN", 22.5726, 88.3639, "Asia/Kolkata"),
  "Asia/Dubai": place("292223", "Dubai", "Dubai", "United Arab Emirates", "AE", 25.2048, 55.2708, "Asia/Dubai"),
  "Asia/Bangkok": place("1609350", "Bangkok", "Bangkok", "Thailand", "TH", 13.7563, 100.5018, "Asia/Bangkok"),
  "Australia/Sydney": SYDNEY,
  "Australia/Melbourne": place("2158177", "Melbourne", "Victoria", "Australia", "AU", -37.8136, 144.9631, "Australia/Melbourne"),
  "Pacific/Auckland": place("2193733", "Auckland", "Auckland", "New Zealand", "NZ", -36.8509, 174.7645, "Pacific/Auckland"),
  "Africa/Johannesburg": place("993800", "Johannesburg", "Gauteng", "South Africa", "ZA", -26.2041, 28.0473, "Africa/Johannesburg"),
  "Africa/Cairo": place("360630", "Cairo", "Cairo", "Egypt", "EG", 30.0444, 31.2357, "Africa/Cairo"),
  UTC: LONDON,
  "Etc/UTC": LONDON,
};

export function placeFromTimezone(timeZone: string): Place | null {
  return KNOWN[timeZone] ?? null;
}

export function cityGuessFromTimezone(timeZone: string): string | null {
  if (!timeZone || timeZone === "UTC" || timeZone === "Etc/UTC") return null;
  const city = timeZone.split("/").pop()?.replace(/_/g, " ").trim();
  return city || null;
}

const PLACE_KEY = "quorum.place";
const RECENT_KEY = "quorum.recent";
const UNITS_KEY = "quorum.units";
const THEME_KEY = "quorum.theme";

export type ThemeChoice = "light" | "dark";

export function readSavedTheme(): ThemeChoice | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: ThemeChoice) {
  localStorage.setItem(THEME_KEY, theme);
}

export function readSavedPlace(): Place | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    return parsePlace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readRecentPlaces(): Place[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parsePlace).filter((p): p is Place => p != null).slice(0, 5);
  } catch {
    return [];
  }
}

export function rememberPlace(placeToSave: Place) {
  localStorage.setItem(PLACE_KEY, JSON.stringify(placeToSave));
  const recent = [placeToSave, ...readRecentPlaces().filter((p) => p.id !== placeToSave.id)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

export function readSavedUnits(): "f" | "c" | null {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    return raw === "f" || raw === "c" ? raw : null;
  } catch {
    return null;
  }
}

export function saveUnits(units: "f" | "c") {
  localStorage.setItem(UNITS_KEY, units);
}

function parsePlace(value: unknown): Place | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<Place>;
  if (typeof r.name !== "string" || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
  if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
  return {
    id: typeof r.id === "string" ? r.id : `${r.latitude},${r.longitude}`,
    name: r.name,
    admin: typeof r.admin === "string" ? r.admin : "",
    country: typeof r.country === "string" ? r.country : "",
    countryCode: typeof r.countryCode === "string" ? r.countryCode : "",
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: typeof r.timezone === "string" && r.timezone ? r.timezone : "UTC",
  };
}
