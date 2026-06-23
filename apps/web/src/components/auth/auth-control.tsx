"use client";

import * as React from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { ChevronDown, Copy, LogOut, Wallet as WalletIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BalancePill } from "@/components/credits/balance-pill";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function shortAddress(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

/**
 * The single persistent auth entry point in the header. Drives the whole flow:
 * connect wallet → sign in with Solana → show the account (address, balance,
 * sign out). Works from any page because the auth state is shared via context.
 */
export function AuthControl() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { status, user, signIn, signOut, error } = useAuth();

  // Surface sign-in failures (e.g. user rejected the signature) once each.
  const lastError = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (error && error !== lastError.current) {
      lastError.current = error;
      toast.error(error);
    }
    if (!error) lastError.current = null;
  }, [error]);

  // Initial session hydration — keep the layout stable with a quiet placeholder.
  if (status === "loading") {
    return <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" aria-hidden />;
  }

  if (status === "authenticated" && user) {
    return <AccountMenu address={user.walletAddress} username={user.username} onSignOut={signOut} />;
  }

  if (status === "signing") {
    return (
      <Button size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Signing in…
      </Button>
    );
  }

  // Connected wallet but no session yet — one tap to sign the SIWS message.
  if (connected) {
    return (
      <Button size="sm" onClick={() => void signIn()}>
        Sign in
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => setVisible(true)}>
      <WalletIcon className="h-4 w-4" />
      Connect wallet
    </Button>
  );
}

function AccountMenu({
  address,
  username,
  onSignOut,
}: {
  address: string;
  username: string;
  onSignOut: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy the address");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <BalancePill className="hidden sm:inline-flex" />
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5",
            "text-sm transition-colors hover:border-border-strong focus-visible:focus-ring",
          )}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-rival/15 text-[10px] font-semibold uppercase text-rival"
            aria-hidden
          >
            {username.slice(0, 2)}
          </span>
          <span className="hidden font-mono text-xs text-fg tabular sm:inline">{shortAddress(address)}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card-hover animate-fade-up"
          >
            <div className="border-b border-border px-3.5 py-3">
              <p className="text-sm font-medium text-fg">{username}</p>
              <button
                type="button"
                onClick={copyAddress}
                className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-faint transition-colors hover:text-muted focus-visible:focus-ring rounded"
              >
                {shortAddress(address)}
                <Copy className="h-3 w-3" aria-hidden />
              </button>
            </div>
            <div className="p-1.5">
              <Link
                href="/wallet"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:focus-ring"
              >
                <WalletIcon className="h-4 w-4" aria-hidden />
                Wallet &amp; balance
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void onSignOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-danger focus-visible:focus-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
