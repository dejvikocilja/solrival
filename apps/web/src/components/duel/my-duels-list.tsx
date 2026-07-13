"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Swords, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SolAmount } from "@/components/marketplace/sol-amount";
import { ExpiryMeter } from "@/components/marketplace/expiry-meter";
import { GAME_META } from "@/components/marketplace/game-meta";
import { cn } from "@/lib/utils";
import type { MyDuel } from "@/server/services/duel/my-duels";

const STATUS_META: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
  CREATED: { label: "Opening", tone: "neutral" },
  WAITING_FOR_OPPONENT: { label: "Open", tone: "rival" },
  ACCEPTED: { label: "Accepted", tone: "ember" },
  ACTIVE: { label: "Live", tone: "victory" },
  VERIFYING: { label: "Verifying", tone: "ember" },
  COMPLETED: { label: "Completed", tone: "victory" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  DISPUTED: { label: "Disputed", tone: "ember" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

const GROUP: Record<string, "open" | "live" | "done"> = {
  CREATED: "open",
  WAITING_FOR_OPPONENT: "open",
  ACCEPTED: "live",
  ACTIVE: "live",
  VERIFYING: "live",
  DISPUTED: "live",
  COMPLETED: "done",
  EXPIRED: "done",
  CANCELLED: "done",
  REFUNDED: "done",
};

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "live", label: "Live" },
  { key: "done", label: "Completed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function MyDuelsList({ duels }: { duels: MyDuel[]; currentUserId: string }) {
  const [tab, setTab] = React.useState<TabKey>("all");

  const counts = React.useMemo(() => {
    const c: Record<TabKey, number> = { all: duels.length, open: 0, live: 0, done: 0 };
    for (const d of duels) c[GROUP[d.status] ?? "done"]++;
    return c;
  }, [duels]);

  const filtered = tab === "all" ? duels : duels.filter((d) => (GROUP[d.status] ?? "done") === tab);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-caption font-medium transition-colors focus-visible:focus-ring",
                active
                  ? "border-rival/60 bg-rival/10 text-fg"
                  : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {t.label}
              <span className={cn("ml-1.5 tabular", active ? "text-rival" : "text-faint")}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((d) => (
            <li key={d.id}>
              <MyDuelRow duel={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyDuelRow({ duel }: { duel: MyDuel }) {
  const game = GAME_META[duel.game];
  const status = STATUS_META[duel.status] ?? { label: duel.status, tone: "neutral" as const };
  const rival = duel.role === "creator" ? duel.opponent : duel.creator;
  const isOpen = duel.status === "WAITING_FOR_OPPONENT" || duel.status === "CREATED";
  // `from=my-duels` tells the detail page to send "back" here rather than to
  // the marketplace (which the player may never have visited).
  const href = duel.inviteToken
    ? `/duels/${duel.id}?invite=${encodeURIComponent(duel.inviteToken)}&from=my-duels`
    : `/duels/${duel.id}?from=my-duels`;

  return (
    <Link href={href} className="block rounded-xl focus-visible:focus-ring">
      <Card className="group relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover sm:p-5">
        <span className={cn("absolute inset-y-0 left-0 w-1", game.rail)} aria-hidden />
        <div className="pl-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={game.badgeTone}>{game.label}</Badge>
              <Badge tone={status.tone}>{status.label}</Badge>
              <span className="text-overline uppercase text-faint">
                {duel.role === "creator" ? "You hosted" : "You joined"}
              </span>
            </div>
            <span className="shrink-0 font-mono text-caption text-faint tabular">#{duel.shortCode}</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-fg">{duel.rule?.displayName ?? "Custom rules"}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-caption text-muted">
                <Swords className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                {rival ? (
                  <>vs <span className="font-medium text-fg">{rival.username}</span></>
                ) : (
                  <span className="text-faint">Waiting for a rival</span>
                )}
              </p>
            </div>
            <Outcome duel={duel} />
          </div>

          {isOpen ? <ExpiryMeter expiresAt={duel.expiresAt} className="mt-3" /> : null}

          <div className="mt-3 flex items-center justify-between text-caption text-faint">
            <span className="tabular">
              Stake <SolAmount lamports={duel.stakeLamports} className="text-muted" />
            </span>
            <span className="inline-flex items-center gap-1 text-muted transition-colors group-hover:text-fg">
              View <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Outcome({ duel }: { duel: MyDuel }) {
  if (duel.status === "COMPLETED") {
    return (
      <div className="text-right">
        <div
          className={cn(
            "text-overline uppercase",
            duel.youWon ? "text-victory" : "text-danger",
          )}
        >
          {duel.youWon ? "Win" : "Loss"}
        </div>
        <SolAmount
          lamports={duel.youWon ? duel.rewardLamports : duel.stakeLamports}
          className={cn("text-body font-semibold", duel.youWon ? "text-victory" : "text-danger")}
        />
      </div>
    );
  }
  if (duel.status === "REFUNDED" || duel.status === "CANCELLED") {
    return (
      <div className="text-right">
        <div className="text-overline uppercase text-faint">Refunded</div>
        <SolAmount lamports={duel.stakeLamports} className="text-body font-medium text-muted" />
      </div>
    );
  }
  return (
    <div className="text-right">
      <div className="text-overline uppercase text-faint">Winner takes</div>
      <SolAmount lamports={duel.rewardLamports} className="text-body font-semibold text-victory" />
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const msg =
    tab === "open"
      ? "No open duels right now."
      : tab === "live"
        ? "No duels in progress."
        : tab === "done"
          ? "No completed duels yet."
          : "You haven't created or joined any duels yet.";
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-2/30 px-6 py-14 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Trophy className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-body text-muted">{msg}</p>
      <Link href="/marketplace" className="mt-1 inline-block text-body text-rival hover:underline">
        Browse open duels
      </Link>
    </div>
  );
}