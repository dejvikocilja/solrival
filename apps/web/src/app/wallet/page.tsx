"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Card, CardContent } from "@/components/ui/card";
import { DepositCard } from "@/components/credits/deposit-card";
import { WithdrawCard } from "@/components/credits/withdraw-card";
import { ActivityCard } from "@/components/credits/activity-list";
import { useBalance, useWithdrawals } from "@/hooks/useCredits";
import { lamportsToSol } from "@/lib/utils";

export default function WalletPage() {
  const { data, isLoading } = useBalance();
  const { data: wd } = useWithdrawals();
  const balance = data?.balance;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Wallet</h1>
          <p className="mt-1 text-sm text-faint">
            Deposit once, play as many duels as you like, withdraw anytime.
          </p>
        </div>
        <WalletMultiButton />
      </header>

      {/* Balance summary */}
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
    </main>
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
