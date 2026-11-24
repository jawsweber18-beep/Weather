import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { BriefingInput, SurfBriefing } from "./types";

export const loadSurf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: BriefingInput) => input)
  .handler(async ({ data }): Promise<SurfBriefing> => {
    const { loadSurfData } = await import("./surf.server.ts");
    return loadSurfData(data);
  });
