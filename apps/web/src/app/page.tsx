import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ShieldCheck, Zap } from "lucide-react";
import { listDuelsQuerySchema } from "@solrival/shared";
import { getArena } from "@/server/services/duel/arena";
import { buttonVariants } from "@/components/ui/button";
import { DuelCard } from "@/components/arena/duel-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "SolRival — Competitive 1v1 duels for real stakes",
  description:
    "Challenge players to skill-based 1v1 duels in Clash Royale and Brawl Stars. Both rivals stake the same, the pot is held in Solana escrow, and the winner is paid automatically.",
};

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "Challenge",
    body: "Pick a game, set your stake and rules, and open a duel — or accept an open challenge from the arena.",
  },
  {
    n: "02",
    title: "Escrow",
    body: "The moment a rival accepts, both stakes lock in escrow. Neither player can touch the pot until the match settles.",
  },
  {
    n: "03",
    title: "Payout",
    body: "Play your match in-game. We verify the result from the official battle log and credit the winner the full pot.",
  },
];

export default async function HomePage() {
  const { duels } = await getArena(listDuelsQuerySchema.parse({}));
  const liveDuels = duels.slice(0, 3);

  return (
    <div className="relative">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-12 pt-16 text-center sm:px-6 sm:pb-16 sm:pt-24">
        <div className="animate-fade-up">
          <div className="relative mx-auto mb-7 h-24 w-24">
            <div
              className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-rival/45 to-cr/30 blur-2xl"
              aria-hidden
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/solrival-emblem.png" alt="" width={96} height={96} className="h-24 w-24" />
          </div>

          <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight text-fg sm:text-6xl">
            Beat your rival.
            <br />
            Take the{" "}
            <span className="bg-gradient-to-r from-rival to-cr bg-clip-text text-transparent">pot</span>.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Stake SOL, challenge anyone to Clash Royale or Brawl Stars, and win on skill alone. Escrow
            holds the pot and pays the winner automatically — no house, no luck.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/duels/create" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>
              Create a duel
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/arena" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
              Browse open duels
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-muted">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-rival" aria-hidden />
              Funds in escrow
            </span>
            <span className="inline-flex items-center gap-2">
              <Zap className="h-4 w-4 text-rival" aria-hidden />
              Instant payouts
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-rival" aria-hidden />
              Auto-verified results
            </span>
          </div>
        </div>
      </section>

      {/* ── Live now ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-victory shadow-[0_0_8px_hsl(var(--victory))]" aria-hidden />
            <h2 className="text-overline uppercase text-muted">Live now</h2>
          </div>
          <Link href="/arena" className="text-sm text-muted transition-colors hover:text-fg">
            View all →
          </Link>
        </div>

        {liveDuels.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveDuels.map((duel) => (
              <DuelCard key={duel.id} duel={duel} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
            <h3 className="text-heading-3 text-fg">No open duels right now</h3>
            <p className="mt-1 max-w-sm text-body-sm text-muted">
              Be the first to put a challenge on the board and let a rival come to you.
            </p>
            <Link
              href="/duels/create"
              className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-5")}
            >
              Create the first duel
            </Link>
          </div>
        )}
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-bg-raised/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-xl">
            <h2 className="font-display text-heading-1 text-fg">From challenge to payout</h2>
            <p className="mt-2 text-body text-muted">
              The entire pot goes to the winner and settlement is automatic. Here&apos;s the whole flow.
            </p>
          </div>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-surface p-6">
                <span className="font-display text-sm font-semibold text-rival tabular">{s.n}</span>
                <h3 className="mt-3 text-heading-3 text-fg">{s.title}</h3>
                <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Assurance
              icon={ShieldCheck}
              title="Stakes held in escrow"
              body="Funds lock when a duel is accepted and can't be moved until it settles."
            />
            <Assurance
              icon={BadgeCheck}
              title="Verified from the source"
              body="Results are read straight from the official Supercell battle log — no self-reporting."
            />
            <Assurance
              icon={Zap}
              title="Paid the instant it's settled"
              body="The winner's balance is credited automatically. Withdraw to your wallet anytime."
            />
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 shadow-card sm:p-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(40rem 20rem at 100% 0%, hsl(var(--rival) / 0.12), transparent 60%)",
            }}
            aria-hidden
          />
          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-heading-1 text-fg">Find a rival worth beating.</h2>
              <p className="mt-2 max-w-md text-body text-muted">
                Browse open challenges and accept one in seconds, or set your own terms and wait for a
                rival.
              </p>
            </div>
            <Link
              href="/arena"
              className={cn(buttonVariants({ variant: "primary", size: "lg" }), "shrink-0")}
            >
              Enter the arena
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Assurance({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-rival">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-body-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
