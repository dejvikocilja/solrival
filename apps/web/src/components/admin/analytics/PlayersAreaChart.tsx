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

export interface PlayersPerDayPoint {
  date: string; // ISO yyyy-mm-dd
  count: number;
}

const AXIS_TICK = { fill: "hsl(var(--faint))", fontSize: 11 };

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * New-player signups per day. Teal (--cr) keeps the dashboard's color story
 * coherent: duels are brand purple, money is victory green, growth is the
 * brand-gradient teal.
 */
export function PlayersAreaChart({ data }: { data: PlayersPerDayPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="admin-players-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--cr))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--cr))" stopOpacity={0} />
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
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border-strong))", strokeWidth: 1 }}
            content={
              <ChartTooltip
                labelFormatter={(l) => shortDate(String(l))}
                valueFormatter={(v) => `${v} player${v === 1 ? "" : "s"}`}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="count"
            name="New players"
            stroke="hsl(var(--cr))"
            strokeWidth={2}
            fill="url(#admin-players-fill)"
            activeDot={{ r: 3.5, fill: "hsl(var(--cr))", stroke: "hsl(var(--bg))", strokeWidth: 2 }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
