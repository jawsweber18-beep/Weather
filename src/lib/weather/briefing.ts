import { createServerFn } from "@tanstack/react-start";
import type { Briefing, BriefingInput, Place, RadarPack } from "./types";

export const loadBriefing = createServerFn({ method: "POST" })
  .validator((input: BriefingInput) => input)
  .handler(async ({ data }): Promise<Briefing> => {
    const { loadBriefingData } = await import("./briefing.server.ts");
    return loadBriefingData(data);
  });

export const searchPlaces = createServerFn({ method: "POST" })
  .validator((input: { query: string }) => ({ query: input.query.trim().slice(0, 80) }))
  .handler(async ({ data }): Promise<{ results: Place[]; error: string | null }> => {
    if (data.query.length < 2) return { results: [], error: null };
    try {
      const { searchPlacesData } = await import("./briefing.server.ts");
      return { results: await searchPlacesData(data.query), error: null };
    } catch {
      return { results: [], error: "Search didn't answer." };
    }
  });

export const reversePlace = createServerFn({ method: "POST" })
  .validator((input: { latitude: number; longitude: number }) => input)
  .handler(async ({ data }): Promise<Place | null> => {
    if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return null;
    try {
      const { reversePlaceData } = await import("./briefing.server.ts");
      return await reversePlaceData(data.latitude, data.longitude);
    } catch {
      return null;
    }
  });

export const loadRadar = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<RadarPack> => {
    const { loadRadarData } = await import("./briefing.server.ts");
    return loadRadarData();
  });
