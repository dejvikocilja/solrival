"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Wallet, TrendingUp, Landmark, ShieldAlert, ArrowDownLeft, ArrowUpRight, Swords,
  RefreshCw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReconciliationPanel, type Reconciliation } from "@/components/admin/ReconciliationPanel";
import { StatCard } from "@/components/admin/StatCard";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";

/**
 * Treasury ledger.
 *
 * The number that matters is "Safe to withdraw": the treasury holds user money
 * (their credit balances) alongside platform profit, so the wallet balance is
 * NOT the profit. Withdrawing more than the safe figure makes the platform
 * unable to honour user cash-outs.
 */

interface Summary {
  depositsInLamports: string;
  withdrawalsOutLamports: string;
  expectedBalanceLamports: string;
  depositFeesLamports: string;
  withdrawalFeesLamports: string;
  duelRakeLamports: string;
  totalProfitLamports: string;
  userLiabilitiesLamports: string;
  safeToWithdrawLamports: string;
  safetyBufferLamports: string;
  insolvent: boolean;
  counts: { deposits: number; withdrawals: number; settledDuels: number };
}

interface Flow {
  id: string;
  kind: "DEPOSIT" | "WITHDRAWAL" | "DUEL_RAKE";
  deltaLamports: string;
  feeLamports: string;
  username: string | null;
  txSignature: string | null;
  at: string;
}

const LAMPORTS = 1_000_000_000;

/** Lamports (decimal string, may be negative) → SOL, 4dp. */
function sol(lamports: string): string {
  return (Number(BigInt(lamports)) / LAMPORTS).toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  });
}

const KIND_META: Record<Flow["kind"], { label: string; icon: React.ReactNode }> = {
  DEPOSIT: { label: "Deposit", icon: <ArrowDownLeft className="h-3.5 w-3.5 text-victory" /> },
  WITHDRAWAL: { label: "Withdrawal", icon: <ArrowUpRight className="h-3.5 w-3.5 text-ember" /> },
  DUEL_RAKE: { label: "Duel rake", icon: <Swords className="h-3.5 w-3.5 text-rival" /> },
};

export default function AdminTreasuryPage() {
  // Polled rather than fetched once: the treasury is the page an operator
  // leaves open while payouts run, and a frozen balance there is misleading in
  // exactly the moments it matters.
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<"ALL" | "DEPOSIT" | "WITHDRAWAL" | "DUEL_RAKE">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams({ page: String(page), kind });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const query = useQuery({
    queryKey: ["admin-treasury", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/treasury?${params.toString()}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load treasury");
      // `ok()` serializes the payload directly — there is no `data` envelope.
      return (await res.json()) as {
        summary: Summary;
        reconciliation: Reconciliation;
        flows: {
          rows: Flow[];
          total: number;
          page: number;
          pageSize: number;
          totalPages: number;
        };
      };
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    // Keeps the current page visible while the next one loads, so paging and
    // the 20s poll never blank the table.
    placeholderData: keepPreviousData,
  });

  const summary = query.data?.summary ?? null;
  const reconciliation = query.data?.reconciliation ?? null;
  const flowPage = query.data?.flows;
  const flows = flowPage?.rows ?? [];
  const loading = query.isLoading;
  const error = query.isError ? "Failed to load treasury" : null;

  const columns: Column<Flow>[] = [
    {
      key: "kind",
      header: "Type",
      render: (f) => (
        <span className="inline-flex items-center gap-1.5 text-body-sm text-fg">
          {KIND_META[f.kind].icon}
          {KIND_META[f.kind].label}
        </span>
      ),
    },
    { key: "username", header: "User / Duel", render: (f) => f.username ?? "—" },
    {
      key: "deltaLamports",
      header: "Wallet change",
      render: (f) => {
        const v = BigInt(f.deltaLamports);
        if (v === 0n) return <span className="text-faint">—</span>;
        return (
          <span className={v > 0n ? "tabular text-victory" : "tabular text-ember"}>
            {v > 0n ? "+" : ""}
            {sol(f.deltaLamports)} SOL
          </span>
        );
      },
    },
    {
      key: "feeLamports",
      header: "Fee earned",
      render: (f) =>
        BigInt(f.feeLamports) > 0n ? (
          <span className="tabular text-victory">+{sol(f.feeLamports)} SOL</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "at",
      header: "When",
      render: (f) => new Date(f.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (error || !summary) {
    return <EmptyState title="Couldn't load the treasury" description={error ?? "Please try again."} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="font-display text-heading-2 text-fg">Treasury</h1>
        <p className="mt-1 text-body-sm text-muted">
          The treasury wallet holds user balances <em>and</em> platform profit. Only the{" "}
          <span className="text-fg">safe to withdraw</span> figure is genuinely yours — taking more
          would leave users unable to cash out.
        </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh treasury"
        >
          <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      {reconciliation ? <ReconciliationPanel data={reconciliation} /> : null}

      {summary.insolvent ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/[0.07] p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <p className="text-body-sm text-fg">
            <span className="font-medium">Shortfall detected.</span> Recorded deposits minus
            withdrawals ({sol(summary.expectedBalanceLamports)} SOL) is less than what users are owed
            ({sol(summary.userLiabilitiesLamports)} SOL). Do not withdraw. Reconcile the ledger
            against the on-chain wallet balance before anything else.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Safe to withdraw"
          value={`${sol(summary.safeToWithdrawLamports)} SOL`}
          icon={<Wallet className="h-4 w-4" />}
          accent="victory"
          sublabel={`After ${sol(summary.safetyBufferLamports)} SOL buffer`}
        />
        <StatCard
          label="Total profit (all fees)"
          value={`${sol(summary.totalProfitLamports)} SOL`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="rival"
          sublabel="Deposit + withdrawal + duel rake"
        />
        <StatCard
          label="Owed to users"
          value={`${sol(summary.userLiabilitiesLamports)} SOL`}
          icon={<ShieldAlert className="h-4 w-4" />}
          accent="ember"
          sublabel="Available + locked credits"
        />
        <StatCard
          label="Expected wallet balance"
          value={`${sol(summary.expectedBalanceLamports)} SOL`}
          icon={<Landmark className="h-4 w-4" />}
          sublabel="Deposits in − withdrawals out"
        />
      </div>

      {/* Profit breakdown */}
      <div className="rounded-xl border border-border bg-surface-2/40 p-5">
        <h2 className="font-display text-heading-3 text-fg">Where the profit came from</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Deposit fees", value: summary.depositFeesLamports, count: `${summary.counts.deposits} deposits` },
            { label: "Withdrawal fees", value: summary.withdrawalFeesLamports, count: `${summary.counts.withdrawals} withdrawals` },
            { label: "Duel rake", value: summary.duelRakeLamports, count: `${summary.counts.settledDuels} settled duels` },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-caption text-faint">{row.label}</dt>
              <dd className="mt-0.5 font-display text-heading-3 tabular text-victory">
                {sol(row.value)} SOL
              </dd>
              <p className="text-caption text-faint">{row.count}</p>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-border pt-3 text-caption text-muted">
          Duel settlements move credits between users — no SOL enters or leaves the wallet, so only
          the rake counts as income. This is the platform&apos;s internal ledger; before any real
          payout, reconcile it against the wallet&apos;s actual on-chain balance.
        </p>
      </div>

      {/* Flow ledger — paged and filtered in SQL. The movement log grows
          without bound, so it is never fetched whole. */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-heading-3 text-fg">Treasury ledger</h2>
            {flowPage ? (
              <p className="mt-0.5 text-caption text-faint">
                {flowPage.total.toLocaleString()} movement{flowPage.total === 1 ? "" : "s"} · showing{" "}
                {flows.length} per page
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption uppercase tracking-wide text-faint">Type</span>
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setPage(1);
                }}
                className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-fg focus-visible:focus-ring"
              >
                <option value="ALL">All types</option>
                <option value="DEPOSIT">Deposits</option>
                <option value="WITHDRAWAL">Withdrawals</option>
                <option value="DUEL_RAKE">Duel rake</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption uppercase tracking-wide text-faint">From</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-fg [color-scheme:dark] focus-visible:focus-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption uppercase tracking-wide text-faint">To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-fg [color-scheme:dark] focus-visible:focus-ring"
              />
            </label>
            {(kind !== "ALL" || from || to) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKind("ALL");
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {flows.length === 0 ? (
          <EmptyState
            title={kind !== "ALL" || from || to ? "No movements match these filters" : "No treasury activity yet"}
            description={
              kind !== "ALL" || from || to
                ? "Try widening the date range or clearing the type filter."
                : "Deposits, withdrawals and duel rake will appear here."
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={flows} rowKey={(f) => f.id} />

            {flowPage && flowPage.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-caption text-faint">
                  Page {flowPage.page} of {flowPage.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((n) => Math.max(1, n - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= flowPage.totalPages}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
