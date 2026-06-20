"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { lamportsToSol } from "@/lib/utils";
import type { LedgerEntryView, WithdrawalView } from "@/hooks/useCredits";

/** Human labels for ledger entry types. */
const LEDGER_LABELS: Record<string, string> = {
  DEPOSIT_CREDIT: "Deposit",
  STAKE_LOCK: "Duel stake locked",
  STAKE_REFUND: "Stake returned",
  STAKE_FORFEIT: "Duel lost",
  DUEL_PAYOUT: "Duel won",
  WITHDRAWAL_LOCK: "Withdrawal requested",
  WITHDRAWAL_SETTLE: "Withdrawal paid",
  WITHDRAWAL_REVERT: "Withdrawal returned",
  REFERRAL_REWARD: "Referral reward",
  ADMIN_ADJUSTMENT: "Adjustment",
};

function Delta({ lamports }: { lamports: string }) {
  const v = BigInt(lamports);
  if (v === 0n) return <span className="tabular text-faint">—</span>;
  const positive = v > 0n;
  return (
    <span className={`tabular font-mono ${positive ? "text-victory" : "text-muted"}`}>
      {positive ? "+" : "−"}◎{lamportsToSol(v < 0n ? -v : v)}
    </span>
  );
}

export function LedgerList({ entries }: { entries: LedgerEntryView[] }) {
  if (entries.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-faint">No activity yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-fg">{LEDGER_LABELS[e.type] ?? e.type}</p>
            <p className="text-xs text-faint">{new Date(e.createdAt).toLocaleString()}</p>
          </div>
          <Delta lamports={e.deltaAvailable} />
        </li>
      ))}
    </ul>
  );
}

export function WithdrawalList({ withdrawals }: { withdrawals: WithdrawalView[] }) {
  if (withdrawals.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-faint">No withdrawals yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {withdrawals.map((w) => (
        <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono tabular text-sm text-fg">◎{lamportsToSol(w.amountLamports)}</p>
            <p className="truncate text-xs text-faint">
              {new Date(w.createdAt).toLocaleString()} · {w.destinationWallet.slice(0, 4)}…{w.destinationWallet.slice(-4)}
            </p>
          </div>
          <StatusBadge status={w.status} />
        </li>
      ))}
    </ul>
  );
}

export function ActivityCard({
  ledger,
  withdrawals,
}: {
  ledger: LedgerEntryView[];
  withdrawals: WithdrawalView[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Recent activity</h2>
        </CardHeader>
        <CardContent className="p-0">
          <LedgerList entries={ledger} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Withdrawals</h2>
        </CardHeader>
        <CardContent className="p-0">
          <WithdrawalList withdrawals={withdrawals} />
        </CardContent>
      </Card>
    </div>
  );
}
