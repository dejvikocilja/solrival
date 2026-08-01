"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, RefreshCw, Swords, Trophy, TrendingUp, Users } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/StatCard";
import { DuelsBarChart } from "./DuelsBarChart";
import { VolumeAreaChart } from "./VolumeAreaChart";
import { PlayersAreaChart } from "./PlayersAreaChart";
import { GameSplitChart } from "./GameSplitChart";
import { RangePicker } from "./RangePicker";
import {
  type RangeSelection,
  rangeFromParams,
  rangeLabel,
  rangeToParams,
} from "@/lib/admin/analytics-range";
import type { AnalyticsSnapshot } from "@/lib/admin/analytics-types";

/** How often the dashboard re-reads the platform. Fast enough that a duel
 *  settling or a deposit landing shows up while you're watching, slow enough
 *  that an idle open tab isn't a self-inflicted load test. */
const POLL_INTERVAL_MS = 15_000;

const GAME_COLORS = ["hsl(var(--cr))", "hsl(var(--bs))", "hsl(var(--rival))", "hsl(var(--ember))"];

function formatDelta(pct: number | null): { label: string; positive: boolean } | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return { label: "No change", positive: true };
  return { label: `${rounded > 0 ? "+" : ""}${rounded}% vs prior period`, positive: rounded > 0 };
}

/** "12s ago" — a quiet proof the numbers are live rather than a stale render. */
function useAgo(since: number | undefined): string {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);
  if (!since) return "";
  const secs = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

export function AnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [range, setRange] = useState<RangeSelection>(() => rangeFromParams(searchParams));

  // Browser navigation (back/forward, shared link) is the source of truth.
  useEffect(() => {
    setRange(rangeFromParams(searchParams));
  }, [searchParams]);

  const applyRange = useCallback(
    (next: RangeSelection) => {
      setRange(next);
      // Range lives in the URL so a view can be reloaded, bookmarked, or sent
      // to someone else and resolve to the same numbers.
      router.replace(`/admin/analytics?${rangeToParams(next).toString()}`, { scroll: false });
    },
    [router],
  );

  const params = rangeToParams(range).toString();
  const query = useQuery({
    queryKey: ["admin-analytics", params],
    queryFn: () => apiGet<{ data: AnalyticsSnapshot }>(`/api/admin/analytics?${params}`),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    // Keeps the previous range on screen while the next one loads, so changing
    // the window doesn't blank the dashboard.
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const data = query.data?.data;
  const ago = useAgo(query.dataUpdatedAt);
  const label = rangeLabel(range);
  const bucketNote =
    data?.range.bucket === "week" ? "weekly buckets" : data?.range.bucket === "month" ? "monthly buckets" : "daily";

  const gameSplit = (data?.gameSplit ?? []).map((g, i) => ({
    game: g.game,
    matches: g.matches,
    color: GAME_COLORS[i % GAME_COLORS.length]!,
  }));

  const duelsDelta = formatDelta(data?.deltas.duels ?? null);
  const volumeDelta = formatDelta(data?.deltas.volumeSol ?? null);
  const playersDelta = formatDelta(data?.deltas.activePlayers ?? null);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-heading-1 text-fg">Overview</h1>
          <p className="mt-1 text-body-sm text-muted">
            Platform-wide metrics and activity.{" "}
            <span className="text-faint">
              {query.isFetching ? "Refreshing…" : ago ? `Updated ${ago}` : ""}
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh now"
        >
          <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <RangePicker value={range} onChange={applyRange} disabled={query.isLoading} />

      {query.isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-body-sm text-faint">
              Unable to load analytics — check the database connection and try again.
            </p>
            <Button className="mt-4" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Primary stats — scoped to the selected range, except "Active now",
          which is inherently a live figure and carries no date filter. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 sm:gap-4">
        <StatCard
          label="Duels"
          value={data ? data.duels.toLocaleString() : "—"}
          sublabel={label}
          delta={duelsDelta?.label}
          deltaPositive={duelsDelta?.positive}
          icon={<Swords className="h-4 w-4" />}
        />
        <StatCard
          label="Active now"
          value={data ? data.activeDuels.toLocaleString() : "—"}
          sublabel="live"
          accent={data && data.activeDuels > 0 ? "rival" : "neutral"}
          delta={data && data.activeDuels > 0 ? "Live" : undefined}
          deltaPositive={Boolean(data && data.activeDuels > 0)}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Volume"
          value={data ? `◎${data.volumeSol.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
          sublabel={data ? `◎${data.lifetime.volumeSol.toLocaleString(undefined, { maximumFractionDigits: 2 })} all time` : label}
          delta={volumeDelta?.label}
          deltaPositive={volumeDelta?.positive}
          accent="victory"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Fees collected"
          value={data ? `◎${data.feesSol.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—"}
          sublabel={data ? `◎${data.lifetime.feesSol.toLocaleString(undefined, { maximumFractionDigits: 4 })} all time` : label}
          accent="victory"
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          label="Tournaments"
          value={data ? data.tournaments.toLocaleString() : "—"}
          sublabel={label}
          icon={<Trophy className="h-4 w-4" />}
        />
        <StatCard
          label="Active players"
          value={data ? data.activePlayers.toLocaleString() : "—"}
          sublabel={label}
          delta={playersDelta?.label}
          deltaPositive={playersDelta?.positive}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <div>
              <h2 className="text-heading-3 text-fg">Duels created</h2>
              <p className="mt-0.5 text-caption text-faint">
                {label} · {bucketNote}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <DuelsBarChart data={data?.duelsPerDay ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <div>
              <h2 className="text-heading-3 text-fg">Volume</h2>
              <p className="mt-0.5 text-caption text-faint">
                {label} · total stake ×2
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <VolumeAreaChart data={data?.volumePerDay ?? []} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-heading-3 text-fg">Completed matches by game</h2>
            <p className="mt-0.5 text-caption text-faint">{label}</p>
          </CardHeader>
          <CardContent>
            <GameSplitChart data={gameSplit} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-heading-3 text-fg">New players</h2>
            <p className="mt-0.5 text-caption text-faint">
              {label} · {bucketNote}
            </p>
          </CardHeader>
          <CardContent>
            <PlayersAreaChart data={data?.playersPerDay ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
