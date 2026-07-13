import { DuelGridSkeleton } from "@/components/arena/duel-card-skeleton";

export default function ArenaLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
      <div className="mb-7 flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-rival">Live arena</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Open duels</h1>
        <p className="max-w-xl text-sm text-muted">
          Pick a challenge, match the stake, and play. Funds stay in Solana escrow and the winner is
          paid out automatically.
        </p>
      </div>
      <div className="mb-6 h-9 w-full max-w-md rounded-md bg-surface-2 animate-pulse" />
      <DuelGridSkeleton count={6} />
    </main>
  );
}
