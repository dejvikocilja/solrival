"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgeCheck, Swords, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SolAmount } from "@/components/marketplace/sol-amount";
import { ExpiryMeter } from "@/components/marketplace/expiry-meter";
import { GAME_META } from "@/components/marketplace/game-meta";
import { RULE_META } from "@/components/duel/rule-meta";
import { AcceptDuelModal } from "@/components/duel/accept-duel-modal";
import { getDuel, type DuelDetail, type DuelStatus } from "@/lib/api/duels";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";

const STATUS_META: Record<DuelStatus, { label: string; tone: BadgeProps["tone"] }> = {
  CREATED: { label: "Opening", tone: "neutral" },
  WAITING_FOR_OPPONENT: { label: "Open challenge", tone: "rival" },
  ACCEPTED: { label: "Accepted", tone: "ember" },
  ACTIVE: { label: "Live now", tone: "victory" },
  SETTLED: { label: "Settled", tone: "victory" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

function shortWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export function DuelDetailView({ id, inviteToken }: { id: string; inviteToken?: string }) {
  const { user } = useAuth();
  const [accepting, setAccepting] = React.useState(false);

  const query = useQuery({
    queryKey: ["duel", id],
    queryFn: () => getDuel(id, inviteToken),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <StateCard
        title={notFound ? "This duel isn't available" : "Couldn't load this duel"}
        body={
          notFound
            ? "It may have been accepted, cancelled, or expired — or the link is private."
            : query.error instanceof ApiError
              ? query.error.message
              : "Something went wrong. Please try again."
        }
        action={
          notFound ? (
            <Link href="/marketplace" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full">
                Browse open duels
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  const duel = query.data.duel;
  const game = GAME_META[duel.game];
  const status = STATUS_META[duel.status];
  const ruleLabel = duel.rule ? RULE_META[duel.rule.template]?.label ?? duel.rule.displayName : "Custom rules";
  const ruleSummary = duel.rule ? RULE_META[duel.rule.template]?.summary : null;

  const stake = BigInt(duel.stakeLamports);
  const pot = stake * 2n;
  const fee = (pot * BigInt(duel.platformFeeBps)) / 10_000n;
  const reward = pot - fee;

  const isCreator = user?.id === duel.creator.id;
  const isOpen = duel.status === "WAITING_FOR_OPPONENT";
  const canAccept = isOpen && !isCreator;

  return (
    <>
      <Card className="overflow-hidden">
        <span className={`block h-1 w-full ${game.rail}`} aria-hidden />
        <CardContent className="space-y-6 p-5 sm:p-6">
          {/* header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={game.badgeTone}>{game.label}</Badge>
                <Badge tone={status.tone}>{status.label}</Badge>
                {isCreator ? <Badge tone="neutral">Your duel</Badge> : null}
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{ruleLabel}</h1>
              {ruleSummary ? <p className="max-w-md text-sm text-muted">{ruleSummary}</p> : null}
            </div>
            <span className="font-mono text-xs text-faint tabular">#{duel.shortCode}</span>
          </div>

          {/* players */}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <PlayerTile
              label="Challenger"
              username={duel.creator.username}
              wallet={duel.creator.walletAddress}
              ring={game.ring}
            />
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
              <Swords className="h-4 w-4" aria-hidden />
            </div>
            {duel.opponent ? (
              <PlayerTile
                label="Rival"
                username={duel.opponent.username}
                wallet={duel.opponent.walletAddress}
                ring={game.ring}
                align="right"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-3 text-center text-sm text-faint sm:text-right">
                Waiting for a rival
              </div>
            )}
          </div>

          {/* economics */}
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-bg-raised/60 p-4">
            <Econ label="Stake" value={<SolAmount lamports={stake.toString()} className="text-fg" />} />
            <Econ label="Prize pool" value={<SolAmount lamports={pot.toString()} className="text-fg" />} />
            <Econ
              label="Winner takes"
              value={<SolAmount lamports={reward.toString()} className="font-semibold text-victory" />}
            />
          </div>

          {/* expiry while open */}
          {isOpen ? <ExpiryMeter expiresAt={duel.expiresAt} /> : null}

          {/* primary action */}
          {canAccept ? (
            <Button size="lg" className="w-full" onClick={() => setAccepting(true)}>
              Accept challenge
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : isCreator && isOpen ? (
            <p className="rounded-md border border-border bg-surface-2/60 px-4 py-3 text-center text-sm text-muted">
              You created this duel. Share the link to invite a rival, or wait for someone in the
              marketplace to accept.
            </p>
          ) : !isOpen ? (
            <p className="rounded-md border border-border bg-surface-2/60 px-4 py-3 text-center text-sm text-muted">
              {duel.status === "EXPIRED" || duel.status === "CANCELLED"
                ? "This challenge is closed. Browse the marketplace for open duels."
                : "This duel has a rival. Add them in-game and play your match — results settle automatically."}
            </p>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-faint">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              Winner credited automatically
            </span>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-1 transition-colors hover:text-muted focus-visible:focus-ring rounded"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              All duels
            </Link>
          </div>
        </CardContent>
      </Card>

      {accepting ? (
        <AcceptDuelModal
          duel={duel}
          onClose={() => setAccepting(false)}
          onAccepted={() => {
            setAccepting(false);
            void query.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function PlayerTile({
  label,
  username,
  wallet,
  ring,
  align = "left",
}: {
  label: string;
  username: string;
  wallet: string;
  ring: string;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3 ${
        align === "right" ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold uppercase text-fg ring-1 ${ring}`}
        aria-hidden
      >
        {username.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
        <p className="flex items-center gap-1 truncate text-sm font-medium text-fg">
          {username}
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-victory" aria-label="Verified" />
        </p>
        <p className="font-mono text-xs text-faint tabular">{shortWallet(wallet)}</p>
      </div>
    </div>
  );
}

function Econ({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-base">{value}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <Card className="overflow-hidden">
      <span className="block h-1 w-full bg-surface-2" aria-hidden />
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="h-8 w-56 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-16 w-full animate-pulse rounded-lg bg-surface-2" />
        <div className="h-20 w-full animate-pulse rounded-lg bg-surface-2" />
        <div className="h-12 w-full animate-pulse rounded-md bg-surface-2" />
      </CardContent>
    </Card>
  );
}

function StateCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Swords className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="font-display text-lg font-semibold text-fg">{title}</h1>
          <p className="mx-auto max-w-sm text-sm text-muted">{body}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
