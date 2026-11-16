import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { BriefingInput, SurfBriefing } from "./types";

export const loadSurf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: BriefingInput) => input)
  .handler(async ({ data }): Promise<SurfBriefing> => {
    try {
      const { loadSurfData } = await import("./briefing.server.ts");
      return loadSurfData(data);
    } catch (err) {
      return {
        error: "Failed to load surf data",
        generatedAt: new Date().toISOString(),
        spot: null,
        days: [],
      };
    }
  });
