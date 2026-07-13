import Link from "next/link";
import { Swords, SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export function ArenaEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={filtered ? SlidersHorizontal : Swords}
      title={filtered ? "No duels match these filters" : "No open duels right now"}
      description={
        filtered
          ? "Try widening your stake or stat ranges, or switch games to see more challenges."
          : "Be the first to put a challenge on the board and let a rival come to you."
      }
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {filtered ? (
            <Link href="/arena" className={cn(buttonVariants({ variant: "secondary", size: "md" }))}>
              Clear filters
            </Link>
          ) : null}
          <Link href="/duels/create" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
            Create a duel
          </Link>
        </div>
      }
    />
  );
}
