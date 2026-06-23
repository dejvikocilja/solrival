import Link from "next/link";
import { Trophy, Gauge, Target, BadgeCheck, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatInt, bpsToPercent } from "@/lib/utils";
import type { MarketplaceDuel } from "@/server/services/duel/marketplace";
import { GAME_META } from "./game-meta";
import { SolAmount } from "./sol-amount";
import { Stat } from "./stat";
import { ExpiryMeter } from "./expiry-meter";

export function DuelCard({ duel }: { duel: MarketplaceDuel }) {
  const game = GAME_META[duel.game];

  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover">
      {/* per-game identity rail */}
      <span className={cn("absolute inset-y-0 left-0 w-1", game.rail)} aria-hidden />

      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        {/* header: game + rule + id */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge tone={game.badgeTone}>{game.label}</Badge>
            <p className="mt-2 truncate text-sm font-medium text-fg">
              {duel.rule?.displayName ?? "Custom rules"}
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs text-faint tabular">#{duel.shortCode}</span>
        </div>

        {/* creator identity */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-fg ring-1",
              game.ring,
            )}
            aria-hidden
          >
            {duel.creator.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-fg">{duel.creator.username}</span>
              {duel.stats?.verified ? (
                <BadgeCheck className="h-4 w-4 shrink-0 text-victory" aria-label="Verified account" />
              ) : null}
            </div>
            <span className="font-mono text-xs text-faint tabular">{duel.creator.walletShort}</span>
          </div>
        </div>

        {/* competitive stats — the trust spine */}
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-md border border-border bg-bg-raised/60 p-3">
          <Stat icon={Trophy} label="Trophies" value={formatInt(duel.stats?.trophies)} />
          <Stat icon={Gauge} label="Level" value={formatInt(duel.stats?.accountLevel)} />
          <Stat icon={Target} label="Win rate" value={bpsToPercent(duel.stats?.winRateBps)} />
        </div>

        {/* economics: stake -> reward */}
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-faint">Stake</div>
            <SolAmount lamports={duel.stakeLamports} className="text-base text-fg" />
          </div>
          <ArrowRight className="mb-1 h-4 w-4 text-faint" aria-hidden />
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-faint">Winner takes</div>
            <SolAmount lamports={duel.rewardLamports} className="text-base font-semibold text-victory" />
          </div>
        </div>

        {/* expiry */}
        <ExpiryMeter expiresAt={duel.expiresAt} className="mt-4" />

        {/* CTA */}
        <Link
          href={`/duels/${duel.id}`}
          className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-4 w-full")}
        >
          Accept challenge
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
