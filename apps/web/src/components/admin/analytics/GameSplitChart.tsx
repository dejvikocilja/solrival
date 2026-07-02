"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "./ChartTooltip";

export interface GameSplitDatum {
  game: string;
  matches: number;
  /** A resolved color string, e.g. "hsl(var(--cr))". */
  color: string;
}

/** 12345 → "12.3k" so the donut's center total can never outgrow the hole. */
function compact(n: number): string {
  return n >= 10_000
    ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : n.toLocaleString();
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
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="matches"
              nameKey="game"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={78}
              paddingAngle={data.length > 1 ? 2 : 0}
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
        {/* Center total — compact-formatted and sized to always fit the hole. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="font-display text-heading-3 tabular text-fg">{compact(total)}</span>
          <span className="text-caption text-faint">matches</span>
        </div>
      </div>

      {/* Legend: everything about a game reads on one line, left-aligned next to
          its dot — no detached numbers floating at the card's far edge. */}
      <ul className="w-full max-w-xs space-y-3">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.matches / total) * 100) : 0;
          return (
            <li key={entry.game} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-fg">{entry.game}</p>
                <p className="text-caption text-muted">
                  <span className="font-mono tabular text-fg">{entry.matches.toLocaleString()}</span>{" "}
                  matches · <span className="font-mono tabular">{pct}%</span> of total
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
