"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet as WalletIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";
import { DepositCard } from "@/components/credits/deposit-card";
import { WithdrawCard } from "@/components/credits/withdraw-card";
import { ActivityCard } from "@/components/credits/activity-list";
import { useBalance, useWithdrawals } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/use-auth";
import { cn, lamportsToSol } from "@/lib/utils";

export default function WalletPage() {
  const { status } = useAuth();

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Your balance"
        title="Wallet"
        description="Deposit once, play as many duels as you like, and withdraw anytime."
      />

      {status === "loading" ? (
        <WalletSkeleton />
      ) : status === "authenticated" ? (
        <AuthedWallet />
      ) : (
        <WalletGate />
      )}
    </PageContainer>
  );
}

function AuthedWallet() {
  const { data, isLoading } = useBalance();
  const { data: wd } = useWithdrawals();
  const balance = data?.balance;

  return (
    <>
      {/* hero balance */}
      <Card className="mb-3 overflow-hidden">
        <CardContent className="bg-gradient-to-br from-rival/[0.08] to-cr/[0.05]">
          <p className="text-overline uppercase text-faint">Available balance</p>
          {isLoading || balance?.availableLamports == null ? (
            <div className="mt-2 h-11 w-44 animate-pulse rounded bg-surface-2" />
          ) : (
            <p className="mt-1 font-display text-4xl font-bold tabular text-fg">
              <span className="mr-1.5 text-2xl opacity-50" aria-hidden>
                ◎
              </span>
              {lamportsToSol(balance.availableLamports)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* secondary stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Locked" value={balance?.lockedLamports} loading={isLoading} />
        <Stat label="Total deposited" value={balance?.lifetimeDepositedLamports} loading={isLoading} />
        <Stat label="Total won" value={balance?.lifetimeWonLamports} loading={isLoading} accent="text-victory" />
      </div>

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
          <h2 className="font-display text-heading-3 text-fg">Sign in to view your balance</h2>
          <p className="mx-auto max-w-sm text-body-sm text-muted">
            Connect your Solana wallet and sign in to deposit, accept duels, and withdraw your
            rewards. Signing is free and never moves funds.
          </p>
        </div>
        {status === "signing" ? (
          <Button size="lg" loading>
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
      <div className="h-24 w-full animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
      </div>
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
  accent,
}: {
  label: string;
  value: string | undefined;
  loading: boolean;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-overline uppercase text-faint">{label}</p>
      {loading || value == null ? (
        <div className="mt-1.5 h-5 w-16 animate-pulse rounded bg-surface-2" />
      ) : (
        <p className={cn("mt-1 font-display text-base font-semibold tabular", accent ?? "text-fg")}>
          <span className="mr-0.5 opacity-60" aria-hidden>
            ◎
          </span>
          {lamportsToSol(value)}
        </p>
      )}
    </div>
  );
}
