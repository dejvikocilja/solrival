"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface AdminWithdrawal {
  id: string;
  status: string;
  amountLamports: string;
  destinationWallet: string;
  autoApproved: boolean;
  heldReason: string | null;
  createdAt: string;
  user: { username: string; walletAddress: string };
}

interface Meta {
  total: number;
  page: number;
  limit: number;
}

const LAMPORTS = 1_000_000_000;
const sol = (l: string) => (Number(BigInt(l)) / LAMPORTS).toLocaleString(undefined, { maximumFractionDigits: 4 });
const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

const STATUS_TABS = ["PENDING_REVIEW", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "FAILED"] as const;

export default function AdminWithdrawalsPage() {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("PENDING_REVIEW");
  const [rows, setRows] = useState<AdminWithdrawal[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 25 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Review modal state
  const [review, setReview] = useState<{ row: AdminWithdrawal; decision: "APPROVE" | "REJECT" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payout, setPayout] = useState<AdminWithdrawal | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/withdrawals?status=${status}&page=${page}&limit=25`, {
        credentials: "same-origin",
      });
      const json = await res.json();
      setRows(json.data ?? []);
      setMeta(json.meta ?? { total: 0, page: 1, limit: 25 });
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = async () => {
    if (!review) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${review.row.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ decision: review.decision }),
      });
      if (!res.ok) throw new Error("Failed");
      setReview(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

const submitPayout = async () => {
    if (!payout) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${payout.id}/payout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? "Payout failed");
      }
      setPayout(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Payout failed");
    } finally {
      setPaying(false);
    }
  };

  const columns: Column<AdminWithdrawal>[] = [
    {
      key: "user",
      header: "Player",
      render: (r) => (
        <div>
          <p className="text-sm text-fg">{r.user.username}</p>
          <p className="font-mono text-xs text-faint">{shortWallet(r.user.walletAddress)}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => <span className="font-mono tabular-nums text-sm text-fg">◎{sol(r.amountLamports)}</span>,
    },
    {
      key: "destination",
      header: "Destination",
      render: (r) => <span className="font-mono text-xs text-muted">{shortWallet(r.destinationWallet)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={r.status} />
          {r.heldReason ? <span className="text-xs text-ember/80">{r.heldReason}</span> : null}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Requested",
      render: (r) => <span className="text-xs text-faint">{new Date(r.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => {
        if (r.status === "PENDING_REVIEW") {
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReview({ row: r, decision: "APPROVE" })}
                className="rounded-lg bg-victory/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-victory"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setReview({ row: r, decision: "REJECT" })}
                className="rounded-lg border border-danger/30 bg-danger/15 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/25"
              >
                Reject
              </button>
            </div>
          );
        }
        if (r.status === "APPROVED") {
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReview({ row: r, decision: "REJECT" })}
                className="rounded-lg border border-danger/30 bg-danger/15 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/25"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setPayout(r)}
                className="rounded-lg bg-rival/90 px-3 py-1.5 text-xs font-medium text-rival-fg hover:brightness-110"
              >
                Pay out
              </button>
            </div>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-heading-1 text-fg">Withdrawals</h1>
        <p className="mt-0.5 text-body-sm text-muted">
          Requests with an active dispute are held here for manual review. All others auto-approve.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface/60 p-0.5">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={[
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                status === s ? "bg-rival text-rival-fg" : "text-muted hover:text-fg",
              ].join(" ")}
            >
              {s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
        <span className="ml-auto text-caption text-faint">{meta.total.toLocaleString()} requests</span>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-6 w-6" />}
          title="Nothing here"
          description={`No withdrawals with status "${status.replace(/_/g, " ").toLowerCase()}".`}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          pagination={{ page: meta.page, total: meta.total, limit: meta.limit, onPage: setPage }}
        />
      )}

      {review ? (
        <ConfirmModal
          title={review.decision === "APPROVE" ? "Approve withdrawal" : "Reject withdrawal"}
          description={
            review.decision === "APPROVE"
              ? `Approve ◎${sol(review.row.amountLamports)} to ${shortWallet(review.row.destinationWallet)}? It will be queued for treasury payout.`
              : `Reject this withdrawal? The locked ◎${sol(review.row.amountLamports)} will be returned to ${review.row.user.username}'s available balance.`
          }
          confirmLabel={review.decision === "APPROVE" ? "Approve" : "Reject"}
          danger={review.decision === "REJECT"}
          loading={submitting}
          onConfirm={submitReview}
          onClose={() => setReview(null)}
        />
      ) : null}

      {payout ? (
        <ConfirmModal
          title="Pay out withdrawal"
          description={`Send ◎${sol(payout.amountLamports)} from the treasury to ${shortWallet(payout.destinationWallet)}? This moves funds on-chain and can't be undone.`}
          confirmLabel="Pay out"
          loading={paying}
          onConfirm={submitPayout}
          onClose={() => setPayout(null)}
        />
      ) : null}
    </div>
  );
}
