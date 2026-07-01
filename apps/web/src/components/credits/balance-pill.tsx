"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useBalance } from "@/hooks/useCredits";
import { lamportsToSol } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Header balance widget. Shows the player's available GGDUEL balance and links
 * to the wallet page for deposit / withdraw. Renders nothing until a balance is
 * available (unauthenticated users get a 401 and it stays hidden).
 */
export function BalancePill({ className }: { className?: string }) {
  const { data, isError } = useBalance();
  if (isError || !data) return null;

  const locked = BigInt(data.balance.lockedLamports);

  return (
    <Link
      href="/wallet"
      aria-label="Open wallet"
      className={cn(
        "group inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 h-9",
        "text-sm transition-colors hover:border-border-strong focus-visible:focus-ring",
        className,
      )}
    >
      <Wallet className="h-4 w-4 text-muted group-hover:text-fg" aria-hidden />
      <span className="font-mono tabular text-fg">
        <span className="mr-0.5 opacity-70" aria-hidden>
          ◎
        </span>
        {lamportsToSol(data.balance.availableLamports)}
      </span>
      {locked > 0n ? (
        <span className="hidden sm:inline text-xs text-faint" title="Locked in active duels / withdrawals">
          (◎{lamportsToSol(locked)} locked)
        </span>
      ) : null}
    </Link>
  );
}
