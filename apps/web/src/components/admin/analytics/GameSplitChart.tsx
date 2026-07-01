"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "./ChartTooltip";

export interface GameSplitDatum {
  game: string;
  matches: number;
  /** A resolved color string, e.g. "hsl(var(--cr))". */
  color: string;
}

export function GameSplitChart({ data }: { data: GameSplitDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.matches, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-body-sm text-faint">
        No completed matches yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="matches"
              nameKey="game"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={72}
              paddingAngle={2}
              stroke="hsl(var(--bg))"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.game} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  valueFormatter={(v) => {
                    const n = Number(v);
                    const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                    return `${n.toLocaleString()} · ${pct}%`;
                  }}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center total */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-heading-2 tabular text-fg">{total.toLocaleString()}</span>
          <span className="text-caption text-faint">matches</span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.matches / total) * 100) : 0;
          return (
            <li key={entry.game} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="text-body-sm text-muted">{entry.game}</span>
              <span className="ml-auto font-mono tabular text-body-sm text-fg">
                {entry.matches.toLocaleString()}
              </span>
              <span className="w-10 text-right font-mono tabular text-caption text-faint">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
