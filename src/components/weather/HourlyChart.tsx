import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/weather/consensus";
import type { Units } from "@/lib/weather/types";

export function HourlyChart({ points, units }: { points: ChartPoint[]; units: Units }) {
  if (points.length < 2) {
    return <p className="py-10 text-sm text-muted">Not enough hours reported for a chart.</p>;
  }
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            interval={points.length > 12 ? 2 : 1}
          />
          <YAxis
            yAxisId="temp"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
            domain={["dataMin - 2", "dataMax + 2"]}
            unit="°"
          />
          <YAxis yAxisId="pop" orientation="right" domain={[0, 100]} hide />
          <Tooltip
            cursor={{ stroke: "var(--color-line)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as ChartPoint | undefined;
              if (!row) return null;
              return (
                <div className="desk-card px-3 py-2 text-sm">
                  <p className="font-medium text-ink">{row.tip}</p>
                  <p className="tabular-nums text-ink">{row.temp == null ? "—" : `${row.temp}°${units === "f" ? "F" : "C"}`}</p>
                  <p className="text-muted">{row.pop == null ? "Precip chance unknown" : `${Math.round(row.pop)}% chance of precip`}</p>
                </div>
              );
            }}
          />
          <Bar yAxisId="pop" dataKey="pop" fill="var(--color-ink)" fillOpacity={0.12} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Area
            yAxisId="temp"
            dataKey="bandBase"
            stackId="spread"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            yAxisId="temp"
            dataKey="band"
            stackId="spread"
            stroke="none"
            fill="var(--color-accent)"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          <Line
            yAxisId="temp"
            dataKey="temp"
            stroke="var(--color-accent)"
            strokeWidth={2.25}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
