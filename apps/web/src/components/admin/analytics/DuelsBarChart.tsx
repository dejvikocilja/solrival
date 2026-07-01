"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";

export interface DuelsPerDayPoint {
  date: string; // ISO yyyy-mm-dd
  count: number;
}

const AXIS_TICK = { fill: "hsl(var(--faint))", fontSize: 11 };

/** yyyy-mm-dd → "Jun 3" for compact axis labels. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DuelsBarChart({ data }: { data: DuelsPerDayPoint[] }) {
  const lastIndex = data.length - 1;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--surface-2) / 0.6)" }}
            content={
              <ChartTooltip
                labelFormatter={(l) => shortDate(String(l))}
                valueFormatter={(v) => `${v} duel${v === 1 ? "" : "s"}`}
              />
            }
          />
          <Bar dataKey="count" name="Duels" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {data.map((entry, i) => (
              <Cell
                key={entry.date}
                fill="hsl(var(--rival))"
                fillOpacity={i === lastIndex ? 1 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
