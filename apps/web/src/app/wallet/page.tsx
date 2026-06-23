"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Loader2, Wallet as WalletIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DepositCard } from "@/components/credits/deposit-card";
import { WithdrawCard } from "@/components/credits/withdraw-card";
import { ActivityCard } from "@/components/credits/activity-list";
import { useBalance, useWithdrawals } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/use-auth";
import { lamportsToSol } from "@/lib/utils";

export default function WalletPage() {
  const { status } = useAuth();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Wallet</h1>
        <p className="mt-1 text-sm text-faint">
          Deposit once, play as many duels as you like, withdraw anytime.
        </p>
      </header>

      {status === "loading" ? (
        <WalletSkeleton />
      ) : status === "authenticated" ? (
        <AuthedWallet />
      ) : (
        <WalletGate />
      )}
    </main>
  );
}

function AuthedWallet() {
  const { data, isLoading } = useBalance();
  const { data: wd } = useWithdrawals();
  const balance = data?.balance;

  return (
    <>
      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Available" value={balance?.availableLamports} loading={isLoading} highlight />
          <Stat label="Locked" value={balance?.lockedLamports} loading={isLoading} />
          <Stat label="Total deposited" value={balance?.lifetimeDepositedLamports} loading={isLoading} />
          <Stat label="Total won" value={balance?.lifetimeWonLamports} loading={isLoading} />
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DepositCard />
        <WithdrawCard balance={balance} />
      </div>

      <ActivityCard ledger={data?.ledger.entries ?? []} withdrawals={wd?.withdrawals ?? []} />
    </>
  );
}

/** Unauthenticated state — drive connect → sign-in, then the balance unlocks. */
function WalletGate() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { status, signIn } = useAuth();

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rival/12 text-rival">
          <WalletIcon className="h-6 w-6" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-fg">Sign in to view your balance</h2>
          <p className="mx-auto max-w-sm text-sm text-muted">
            Connect your Solana wallet and sign in to deposit, accept duels, and withdraw your
            rewards. Signing is free and never moves funds.
          </p>
        </div>
        {status === "signing" ? (
          <Button size="lg" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in…
          </Button>
        ) : connected ? (
          <Button size="lg" onClick={() => void signIn()}>
            Sign in
          </Button>
        ) : (
          <Button size="lg" onClick={() => setVisible(true)}>
            <WalletIcon className="h-4 w-4" />
            Connect wallet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function WalletSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-28 w-full animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-60 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-60 animate-pulse rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
  highlight,
}: {
  label: string;
  value: string | undefined;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-mono tabular text-lg ${highlight ? "text-fg" : "text-muted"}`}>
        {loading || value == null ? (
          <span className="inline-block h-5 w-20 animate-pulse rounded bg-surface-2" />
        ) : (
          <>
            <span className="mr-0.5 opacity-70" aria-hidden>
              ◎
            </span>
            {lamportsToSol(value)}
          </>
        )}
      </p>
    </div>
  );
}
