import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import {
  LEADERBOARD_LIMIT,
  PERIOD_LABELS,
  getLeaderboard,
  type LeaderboardPeriod,
} from "@/server/services/leaderboard/service";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The top SolRival players, ranked by total duels won.",
};

export const dynamic = "force-dynamic";

function shortWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

const PERIODS: LeaderboardPeriod[] = ["day", "week", "all"];

function isPeriod(v: string | undefined): v is LeaderboardPeriod {
  return v === "day" || v === "week" || v === "all";
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  // Unrecognised values fall back rather than 404 — a hand-edited or stale
  // link should still render the board.
  const period: LeaderboardPeriod = isPeriod(raw) ? raw : "week";
  const entries = await getLeaderboard(period);

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Compete"
        title="Leaderboard"
        description={`The top ${LEADERBOARD_LIMIT} players, ranked by duels won. Win more to climb.`}
      />

      {/* Period switcher. Plain links, so this stays a server component and
          each view is shareable and cacheable on its own URL. */}
      <div
        className="mb-5 inline-flex rounded-lg border border-border bg-surface-2 p-1"
        role="tablist"
        aria-label="Leaderboard period"
      >
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/leaderboard?period=${p}`}
            role="tab"
            aria-selected={p === period}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              p === period
                ? "bg-rival/15 text-rival"
                : "text-muted hover:text-fg",
            )}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface-2/40 px-6 py-16 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Trophy className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="text-heading-3 text-fg">
            {period === "all" ? "No ranked players yet" : "No duels settled yet"}
          </h2>
          <p className="mt-1 max-w-sm text-body-sm text-muted">
            {period === "all"
              ? "The board fills up as duels are settled. Win one and you\u2019ll be the first name here."
              : `No duels have been settled ${period === "day" ? "today" : "this week"} yet. Win one and you\u2019ll be the first name here.`}
          </p>
          <Link
            href="/arena"
            className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-5")}
          >
            Find a duel
          </Link>
        </div>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {/* column header (desktop) */}
          <div className="hidden items-center gap-4 px-4 py-2.5 text-overline uppercase text-faint sm:flex">
            <span className="w-7 text-center">#</span>
            <span className="flex-1">Player</span>
            <span className="w-20 text-right">Win rate</span>
            <span className="w-24 text-right">Record</span>
          </div>

          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 sm:gap-4">
              <RankBadge rank={e.rank} />
              <Avatar name={e.username} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-fg">{e.username}</p>
                <p className="font-mono text-caption text-faint tabular">{shortWallet(e.walletAddress)}</p>
              </div>
              <span className="w-20 text-right font-display text-body font-semibold tabular text-fg">
                {e.winRate === null ? "—" : `${e.winRate}%`}
              </span>
              <span className="w-24 text-right font-mono text-caption tabular text-muted">
                <span className="text-victory">{e.wins}W</span> · <span className="text-danger">{e.losses}L</span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const top: Record<number, string> = {
    1: "bg-ember/20 text-ember ring-1 ring-ember/40",
    2: "bg-fg/10 text-fg ring-1 ring-border-strong",
    3: "bg-rival/15 text-rival ring-1 ring-rival/30",
  };
  if (rank <= 3) {
    return (
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold tabular",
          top[rank],
        )}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="w-7 shrink-0 text-center font-display text-sm font-semibold tabular text-faint">
      {rank}
    </span>
  );
}
