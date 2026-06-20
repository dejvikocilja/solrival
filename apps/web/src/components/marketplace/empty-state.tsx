import Link from "next/link";
import { Swords, SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MarketplaceEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-rival">
        {filtered ? <SlidersHorizontal className="h-5 w-5" /> : <Swords className="h-5 w-5" />}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-fg">
        {filtered ? "No duels match these filters" : "No open duels right now"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {filtered
          ? "Try widening your stake or stat ranges, or switch games to see more challenges."
          : "Be the first to put a challenge on the board and let a rival come to you."}
      </p>
      <div className="mt-5 flex gap-2">
        {filtered ? (
          <Link href="/marketplace" className={cn(buttonVariants({ variant: "secondary", size: "md" }))}>
            Clear filters
          </Link>
        ) : null}
        <Link href="/duels/create" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
          Create a duel
        </Link>
      </div>
    </div>
  );
}
