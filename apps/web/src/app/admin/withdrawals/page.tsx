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

  const columns: Column<AdminWithdrawal>[] = [
    {
      key: "user",
      header: "Player",
      render: (r) => (
        <div>
          <p className="text-sm text-zinc-100">{r.user.username}</p>
          <p className="font-mono text-xs text-zinc-500">{shortWallet(r.user.walletAddress)}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => <span className="font-mono tabular-nums text-sm text-zinc-100">◎{sol(r.amountLamports)}</span>,
    },
    {
      key: "destination",
      header: "Destination",
      render: (r) => <span className="font-mono text-xs text-zinc-400">{shortWallet(r.destinationWallet)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={r.status} />
          {r.heldReason ? <span className="text-xs text-amber-400/80">{r.heldReason}</span> : null}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Requested",
      render: (r) => <span className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.status === "PENDING_REVIEW" ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReview({ row: r, decision: "APPROVE" })}
              className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setReview({ row: r, decision: "REJECT" })}
              className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/40"
            >
              Reject
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300">
          <Banknote className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Withdrawals</h1>
          <p className="text-sm text-zinc-500">
            Requests with an active dispute are held here for manual review. All others auto-approve.
          </p>
        </div>
      </header>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              status === s ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
            ].join(" ")}
          >
            {s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
          </button>
        ))}
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
    </div>
  );
}
