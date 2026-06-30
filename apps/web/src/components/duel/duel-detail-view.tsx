"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ShieldCheck, Swords } from "lucide-react";
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
import { cn } from "@/lib/utils";

type StatusMeta = { label: string; tone: BadgeProps["tone"] };

// Keyed by the canonical DuelStatus union (mirrors the Prisma enum). Every status
// MUST have an entry; the `?? UNKNOWN_STATUS` read below is defence-in-depth so a
// future enum value can never white-screen this page again.
const STATUS_META: Record<DuelStatus, StatusMeta> = {
  CREATED: { label: "Opening", tone: "neutral" },
  WAITING_FOR_OPPONENT: { label: "Open challenge", tone: "rival" },
  ACCEPTED: { label: "Accepted", tone: "ember" },
  ACTIVE: { label: "Live now", tone: "victory" },
  VERIFYING: { label: "Verifying", tone: "ember" },
  COMPLETED: { label: "Completed", tone: "victory" },
  DISPUTED: { label: "Disputed", tone: "ember" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

const UNKNOWN_STATUS: StatusMeta = { label: "Unknown", tone: "neutral" };

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
  const status = STATUS_META[duel.status] ?? UNKNOWN_STATUS;
  const ruleLabel = duel.rule ? RULE_META[duel.rule.template]?.label ?? duel.rule.displayName : "Custom rules";
  const ruleSummary = duel.rule ? RULE_META[duel.rule.template]?.summary : null;

  const stake = BigInt(duel.stakeLamports);
  const pot = stake * 2n;
  const fee = (pot * BigInt(duel.platformFeeBps)) / 10_000n;
  const reward = pot - fee;
  const feePct = (duel.platformFeeBps / 100).toString();

  const isCreator = user?.id === duel.creator.id;
  const isParticipant = isCreator || (!!user && user.id === duel.opponent?.id);
  const isOpen = duel.status === "WAITING_FOR_OPPONENT";
  const canAccept = isOpen && !isCreator;

  // For a finished duel, show the viewer's own result in place of the generic
  // "Completed" badge: Win (green) or Loss (red). Non-participants still see status.
  const outcome: StatusMeta | null =
    duel.status === "COMPLETED" && isParticipant && duel.winnerId
      ? user?.id === duel.winnerId
        ? { label: "Win", tone: "victory" }
        : { label: "Loss", tone: "danger" }
      : null;
  const headlineStatus = outcome ?? status;

  return (
    <>
      <Link
        href="/marketplace"
        className="mb-4 inline-flex items-center gap-1.5 text-body-sm text-muted transition-colors hover:text-fg focus-visible:focus-ring rounded"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to marketplace
      </Link>

      <Card className="overflow-hidden">
        <span className={cn("block h-1 w-full", game.rail)} aria-hidden />
        <CardContent className="space-y-6">
          {/* header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={game.badgeTone}>{game.label}</Badge>
                <Badge tone={headlineStatus.tone}>{headlineStatus.label}</Badge>
                {isCreator ? <Badge tone="neutral">Your duel</Badge> : null}
              </div>
              <h1 className="font-display text-heading-1 text-fg">{ruleLabel}</h1>
              {ruleSummary ? <p className="max-w-md text-body text-muted">{ruleSummary}</p> : null}
            </div>
            <span className="font-mono text-caption text-faint tabular">#{duel.shortCode}</span>
          </div>

          {/* face-off */}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <PlayerTile label="Challenger" username={duel.creator.username} wallet={duel.creator.walletAddress} ring={game.ring} />
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 font-display text-xs font-semibold text-faint">
              VS
            </div>
            {duel.opponent ? (
              <PlayerTile label="Rival" username={duel.opponent.username} wallet={duel.opponent.walletAddress} ring={game.ring} align="right" />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-3 text-body-sm text-faint">
                Waiting for a rival
              </div>
            )}
          </div>

          {/* pot breakdown */}
          <div className="rounded-lg border border-border bg-bg-raised/60 p-4">
            <p className="text-overline uppercase text-faint">The pot</p>
            <div className="mt-3 space-y-2">
              <BreakdownRow label="Your stake" value={<SolAmount lamports={stake.toString()} className="text-fg" />} />
              <BreakdownRow label="Opponent stake" value={<SolAmount lamports={stake.toString()} className="text-fg" />} />
              <BreakdownRow label={`Platform fee (${feePct}%)`} value={<span className="font-mono text-sm text-muted tabular">− <SolAmount lamports={fee.toString()} className="text-muted" /></span>} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-body-sm text-muted">Winner takes</span>
              <SolAmount lamports={reward.toString()} className="text-heading-3 font-semibold text-victory" />
            </div>
          </div>

          {/* expiry while open */}
          {isOpen ? <ExpiryMeter expiresAt={duel.expiresAt} /> : null}

          {/* primary action */}
          {canAccept ? (
            <Button size="lg" className="w-full" onClick={() => setAccepting(true)}>
              Accept challenge · <SolAmount lamports={stake.toString()} className="text-rival-fg" />
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : isCreator && isOpen ? (
            <p className="rounded-md border border-border bg-surface-2/60 px-4 py-3 text-center text-body-sm text-muted">
              You created this duel. Share the link to invite a rival, or wait for someone in the marketplace to accept.
            </p>
          ) : !isOpen ? (
            <p className="rounded-md border border-border bg-surface-2/60 px-4 py-3 text-center text-body-sm text-muted">
              {duel.status === "EXPIRED" || duel.status === "CANCELLED"
                ? "This challenge is closed. Browse the marketplace for open duels."
                : "This duel has a rival. Add them in-game and play your match — results settle automatically."}
            </p>
          ) : null}

          {/* escrow assurance */}
          <div className="flex items-center gap-2 border-t border-border pt-4 text-caption text-faint">
            <ShieldCheck className="h-4 w-4 shrink-0 text-victory" aria-hidden />
            Both stakes are held in Solana escrow and the winner is paid automatically once the result is verified.
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
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3",
        align === "right" && "sm:flex-row-reverse sm:text-right",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface font-display text-sm font-semibold uppercase text-fg ring-1",
          ring,
        )}
        aria-hidden
      >
        {username.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="text-overline uppercase text-faint">{label}</p>
        <p className="truncate text-body font-semibold text-fg">{username}</p>
        <p className="font-mono text-caption text-faint tabular">{shortWallet(wallet)}</p>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-muted">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <Card className="overflow-hidden">
      <span className="block h-1 w-full bg-surface-2" aria-hidden />
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="h-8 w-56 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-16 w-full animate-pulse rounded-lg bg-surface-2" />
        <div className="h-24 w-full animate-pulse rounded-lg bg-surface-2" />
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
          <h1 className="font-display text-heading-3 text-fg">{title}</h1>
          <p className="mx-auto max-w-sm text-body-sm text-muted">{body}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
