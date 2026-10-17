import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";
import type { Condition } from "@/lib/weather/types";

export function ConditionIcon({ condition, className }: { condition: Condition; className?: string }) {
  const props = { className, strokeWidth: 1.75, "aria-hidden": true as const };
  switch (condition) {
    case "clear":
      return <Sun {...props} />;
    case "partly":
      return <CloudSun {...props} />;
    case "cloudy":
      return <Cloud {...props} />;
    case "fog":
      return <CloudFog {...props} />;
    case "drizzle":
      return <CloudDrizzle {...props} />;
    case "rain":
      return <CloudRain {...props} />;
    case "snow":
      return <CloudSnow {...props} />;
    case "thunder":
      return <CloudLightning {...props} />;
    default:
      return <Cloud {...props} />;
  }
}
