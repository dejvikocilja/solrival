import Link from "next/link";
import { Trophy, Gauge, Target, BadgeCheck, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatInt, bpsToPercent } from "@/lib/utils";
import type { ArenaDuel } from "@/server/services/duel/arena";
import { GAME_META } from "./game-meta";
import { SolAmount } from "./sol-amount";
import { Stat } from "./stat";
import { ExpiryMeter } from "./expiry-meter";

export function DuelCard({ duel }: { duel: ArenaDuel }) {
  const game = GAME_META[duel.game];

  // The whole card is the link — bigger tap target on mobile, and there are no
  // nested interactive elements, so the CTA below is a visual affordance only.
  return (
    <Link
      href={`/duels/${duel.id}`}
      aria-label={`Accept ${game.label} challenge from ${duel.creator.username}`}
      className="group block rounded-lg focus-visible:focus-ring"
    >
      <Card className="relative overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-card-hover">
        {/* per-game identity rail */}
        <span className={cn("absolute inset-y-0 left-0 w-1", game.rail)} aria-hidden />

        <div className="p-4 pl-5 sm:p-5 sm:pl-6">
          {/* header: game + rule + id */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge tone={game.badgeTone}>{game.label}</Badge>
              <p className="mt-2 truncate text-body font-medium text-fg">
                {duel.rule?.displayName ?? "Custom rules"}
              </p>
            </div>
            <span className="shrink-0 font-mono text-caption text-faint tabular">#{duel.shortCode}</span>
          </div>

          {/* creator identity */}
          <div className="mt-4 flex items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold uppercase text-fg ring-1",
                game.ring,
              )}
              aria-hidden
            >
              {duel.creator.username.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-body font-semibold text-fg">{duel.creator.username}</span>
                {duel.stats?.verified ? (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-victory" aria-label="Verified account" />
                ) : null}
              </div>
              <span className="font-mono text-caption text-faint tabular">{duel.creator.walletShort}</span>
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
              <div className="text-overline uppercase text-faint">Stake</div>
              <SolAmount lamports={duel.stakeLamports} className="text-body-lg text-fg" />
            </div>
            <ArrowRight className="mb-1 h-4 w-4 text-faint" aria-hidden />
            <div className="text-right">
              <div className="text-overline uppercase text-faint">Winner takes</div>
              <SolAmount lamports={duel.rewardLamports} className="text-body-lg font-semibold text-victory" />
            </div>
          </div>

          {/* expiry */}
          <ExpiryMeter expiresAt={duel.expiresAt} className="mt-4" />

          {/* CTA — visual only; the whole card is the link */}
          <div
            className={cn(
              "mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-rival px-4 text-sm font-medium text-rival-fg",
              "shadow-[0_6px_20px_-8px_hsl(var(--rival)/0.9)] transition-all group-hover:brightness-110",
            )}
          >
            Accept challenge
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </div>
      </Card>
    </Link>
  );
}
