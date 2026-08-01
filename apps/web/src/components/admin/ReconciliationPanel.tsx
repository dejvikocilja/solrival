"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, Landmark, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Reconciliation {
  onChainBalanceLamports: string | null;
  expectedOnChainLamports: string;
  driftLamports: string | null;
  baselineLamports: string;
  toleranceLamports: string;
  status: "ok" | "surplus" | "deficit" | "unavailable";
  onChainInsolvent: boolean | null;
  checkedAt: string;
  error: string | null;
  treasuryWallet: string;
}

function sol(lamports: string | null): string {
  if (lamports === null) return "—";
  const v = BigInt(lamports);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1_000_000_000n;
  const frac = (abs % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4);
  return `${neg ? "−" : ""}${whole}.${frac}`;
}

const STATUS_META: Record<
  Reconciliation["status"],
  { label: string; detail: string; className: string; icon: React.ReactNode }
> = {
  ok: {
    label: "Reconciled",
    detail: "The on-chain balance matches what the ledger says it should be.",
    className: "border-victory/30 bg-victory/8 text-victory",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  surplus: {
    label: "Surplus",
    detail:
      "The wallet holds more than the books explain. Usually a manual top-up or a deposit that was never claimed — set TREASURY_BASELINE_LAMPORTS if this is your initial funding.",
    className: "border-rival/30 bg-rival/8 text-rival",
    icon: <HelpCircle className="h-4 w-4" />,
  },
  deficit: {
    label: "Deficit — investigate",
    detail:
      "The wallet holds LESS than the books say it should. SOL has left outside the payout path, or a payout was sent twice. Do not withdraw platform profit until this is explained.",
    className: "border-danger/30 bg-danger/8 text-danger",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  unavailable: {
    label: "Chain unreachable",
    detail:
      "Could not read the treasury balance from the RPC. This is not a pass — the books are unverified until the read succeeds.",
    className: "border-border bg-surface-2 text-muted",
    icon: <HelpCircle className="h-4 w-4" />,
  },
};

/**
 * Books vs chain, side by side.
 *
 * The ledger agreeing with itself proves nothing: a bug that miscounts a payout
 * miscounts it consistently. Only the real wallet balance is ground truth, so
 * it is shown next to the derived figure and the gap between them is the
 * signal. A failed RPC read is rendered as "unverified", never as agreement.
 */
export function ReconciliationPanel({ data }: { data: Reconciliation }) {
  const meta = STATUS_META[data.status];

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-heading-3 text-fg">Treasury reconciliation</h2>
          <p className="mt-0.5 text-caption text-faint">
            Checked {new Date(data.checkedAt).toLocaleTimeString()} ·{" "}
            <span className="tabular">{data.treasuryWallet.slice(0, 4)}…{data.treasuryWallet.slice(-4)}</span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-caption font-medium",
            meta.className,
          )}
        >
          {meta.icon}
          {meta.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-faint">
            <Wallet className="h-3.5 w-3.5" aria-hidden /> On-chain balance
          </p>
          <p className="mt-1.5 font-display text-heading-3 tabular text-fg">
            ◎{sol(data.onChainBalanceLamports)}
          </p>
          <p className="mt-0.5 text-caption text-faint">What the wallet actually holds</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-faint">
            <Landmark className="h-3.5 w-3.5" aria-hidden /> Expected
          </p>
          <p className="mt-1.5 font-display text-heading-3 tabular text-fg">
            ◎{sol(data.expectedOnChainLamports)}
          </p>
          <p className="mt-0.5 text-caption text-faint">
            Baseline ◎{sol(data.baselineLamports)} + deposits − payouts
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-caption uppercase tracking-wide text-faint">Difference</p>
          <p
            className={cn(
              "mt-1.5 font-display text-heading-3 tabular",
              data.status === "ok"
                ? "text-victory"
                : data.status === "deficit"
                  ? "text-danger"
                  : "text-fg",
            )}
          >
            {data.driftLamports === null
              ? "—"
              : `${BigInt(data.driftLamports) > 0n ? "+" : ""}◎${sol(data.driftLamports)}`}
          </p>
          <p className="mt-0.5 text-caption text-faint">
            Tolerance ±◎{sol(data.toleranceLamports)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-body-sm text-muted">{meta.detail}</p>

      {data.error ? (
        <p className="mt-2 text-caption text-danger" role="alert">
          RPC error: {data.error}
        </p>
      ) : null}

      {data.onChainInsolvent ? (
        <p
          className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 p-3 text-body-sm text-danger"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Insolvent on-chain.</strong> The real wallet balance is below total user
            liabilities. Some cash-outs will fail. Fund the treasury before processing further
            withdrawals.
          </span>
        </p>
      ) : null}
    </section>
  );
}
