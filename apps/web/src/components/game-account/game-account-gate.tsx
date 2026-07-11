"use client";

/**
 * useGameAccount(game) — the caller's linked account for a game (or why they
 * can't duel yet), plus GameAccountGate, the inline notice shown wherever a
 * linked account is required (create duel, accept duel). Duels can only be
 * verified and played when both players have linked a tag + invite link, so
 * the forms block until this is satisfied — mirroring the server-side check.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Gamepad2 } from "lucide-react";
import { getGameAccounts, type GameAccountView } from "@/lib/api/game-accounts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Game } from "@solrival/shared";

const GAME_LABEL: Record<Game, string> = {
  CLASH_ROYALE: "Clash Royale",
  BRAWL_STARS: "Brawl Stars",
};

export function useGameAccount(game: Game, enabled: boolean) {
  const query = useQuery({
    queryKey: ["game-accounts"],
    queryFn: getGameAccounts,
    enabled,
    staleTime: 30_000,
  });
  const account: GameAccountView | null =
    query.data?.accounts.find((a) => a.game === game && a.friendLink) ?? null;
  return {
    /** True while we can't yet say whether they're linked. */
    loading: enabled && query.isPending,
    /** Linked with both tag and invite link — allowed to duel in this game. */
    linked: account !== null,
    account,
  };
}

/** Inline notice blocking a duel form until the game account is linked. */
export function GameAccountGate({ game }: { game: Game }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-ember/30 bg-ember/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
        <p className="text-body-sm text-muted">
          Link your {GAME_LABEL[game]} account first — your player tag lets us verify the match
          automatically, and your invite link lets your opponent add you in-game.
        </p>
      </div>
      <Link href="/settings" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}>
        Link in Settings
      </Link>
    </div>
  );
}
