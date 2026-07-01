"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";

export interface VolumePerDayPoint {
  date: string; // ISO yyyy-mm-dd
  sol: number;
}

const AXIS_TICK = { fill: "hsl(var(--faint))", fontSize: 11 };

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtSol(v: number): string {
  return `◎${v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 3 : 2 })}`;
}

// Money is green in the design language — volume uses victory, not the brand purple.
export function VolumeAreaChart({ data }: { data: VolumePerDayPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="admin-volume-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--victory))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--victory))" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => fmtSol(v)}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border-strong))", strokeWidth: 1 }}
            content={
              <ChartTooltip
                labelFormatter={(l) => shortDate(String(l))}
                valueFormatter={(v) => fmtSol(Number(v))}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="sol"
            name="Volume"
            stroke="hsl(var(--victory))"
            strokeWidth={2}
            fill="url(#admin-volume-fill)"
            activeDot={{ r: 3.5, fill: "hsl(var(--victory))", stroke: "hsl(var(--bg))", strokeWidth: 2 }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
