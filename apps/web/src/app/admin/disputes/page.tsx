'use client'

import { useCallback, useEffect, useId, useState } from "react"
import { DataTable, type Column } from "@/components/admin/DataTable"
import { StatusBadge }  from "@/components/admin/StatusBadge"
import { StatCard }     from "@/components/admin/StatCard"
import { EmptyState }   from "@/components/admin/EmptyState"
import { Flag }         from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminDispute {
  id:        string
  status:    string
  reason:    string | null
  createdAt: string
  resolvedAt: string | null
  resolutionNotes: string | null
  duel: {
    id:        string
    shortCode: string
    game:      string
    stakeLamports: string
    creator:   { username: string } | null
    opponent:  { username: string } | null
  } | null
  raisedBy:       { username: string } | null
  resolvedByAdmin: { username: string } | null
}

interface Meta { total: number; page: number; limit: number }

const LAMPORTS = 1_000_000_000
const GAME_LABELS: Record<string, string> = {
  CLASH_ROYALE: "CR",
  BRAWL_STARS:  "BS",
}

// ─── Resolve modal ────────────────────────────────────────────────────────────

interface ResolveModalProps {
  dispute:  AdminDispute
  onSave:   (resolution: string, outcome: string) => Promise<void>
  onClose:  () => void
}

function ResolveModal({ dispute, onSave, onClose }: ResolveModalProps) {
  const titleId    = useId()
  const [notes,    setNotes]    = useState("")
  const [outcome,  setOutcome]  = useState("RESOLVED_REFUND")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!notes.trim()) { setError("Resolution notes are required."); return }
    setLoading(true)
    setError(null)
    try {
      await onSave(notes.trim(), outcome)
    } catch {
      setError("Failed to resolve dispute. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [loading, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-border bg-bg shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold text-fg">Resolve Dispute</h2>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-6 py-5">
            {/* Context */}
            <div className="rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm">
              <p className="text-muted">
                Duel <span className="font-mono text-fg">{dispute.duel?.shortCode}</span>
                {" · "}
                <span className="text-fg">
                  @{dispute.duel?.creator?.username ?? "—"} vs @{dispute.duel?.opponent?.username ?? "—"}
                </span>
              </p>
              {dispute.reason && (
                <p className="mt-1 text-xs text-faint">Reason: {dispute.reason}</p>
              )}
            </div>

            {/* Outcome */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-fg">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                disabled={loading}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-rival/30 focus:ring-1 focus:ring-rival/30 disabled:opacity-50"
              >
                <option value="RESOLVED_CREATOR_WIN">Creator wins</option>
                <option value="RESOLVED_OPPONENT_WIN">Challenger wins</option>
                <option value="RESOLVED_REFUND">Refund both players</option>
                <option value="REJECTED">Reject dispute</option>
              </select>
              <p className="text-xs text-faint">
                For a frozen (live) duel, rejecting refunds both stakes. For a contested result the
                original outcome stands on reject — while a win for the other player reverses the
                payout, and a refund voids the result and restores both players in full.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-fg">
                Resolution notes <span className="text-danger">*</span>
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
                placeholder="Explain the resolution decision, evidence reviewed, etc."
                className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-rival/30 focus:ring-1 focus:ring-rival/30 disabled:opacity-50"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/15 px-3.5 py-3 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-3 border-t border-border px-6 py-4">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !notes.trim()}
              aria-busy={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rival px-4 py-2.5 text-sm font-medium text-rival-fg transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Resolving…
                </>
              ) : "Resolve dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDisputesPage() {
  const [disputes,   setDisputes]   = useState<AdminDispute[]>([])
  const [meta,       setMeta]       = useState<Meta>({ total: 0, page: 1, limit: 25 })
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<"open" | "all">("open")
  const [page,       setPage]       = useState(1)
  const [resolving,  setResolving]  = useState<AdminDispute | null>(null)
  const [openCount,  setOpenCount]  = useState<number>(0)

  const fetchDisputes = useCallback(async (f: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: f, page: String(p), limit: "25" })
      const res    = await fetch(`/api/admin/disputes?${params}`)
      const json   = await res.json()
      setDisputes(json.data ?? [])
      setMeta(json.meta ?? { total: 0, page: p, limit: 25 })
      if (f === "open") setOpenCount(json.meta?.total ?? 0)
    } catch {
      setDisputes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchDisputes(filter, page)
  }, [filter, page, fetchDisputes])

  // Also fetch open count when showing "all"
  useEffect(() => {
    fetch("/api/admin/disputes?status=open&limit=1")
      .then((r) => r.json())
      .then((j) => setOpenCount(j.meta?.total ?? 0))
      .catch(() => {/* ignore */})
  }, [])

  async function handleResolve(resolution: string, outcome: string) {
    if (!resolving) return
    await fetch(`/api/admin/disputes/${resolving.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ resolution, outcome }),
    })
    setResolving(null)
    void fetchDisputes(filter, page)
  }

  const columns: Column<AdminDispute>[] = [
    {
      key:    "id",
      header: "Dispute ID",
      render: (d) => (
        <span className="font-mono text-xs text-muted">{d.id.slice(0, 8)}…</span>
      ),
    },
    {
      key:    "duel",
      header: "Duel",
      render: (d) => (
        <span className="font-mono text-xs text-fg">{d.duel?.shortCode ?? "—"}</span>
      ),
    },
    {
      key:    "players",
      header: "Players",
      render: (d) =>
        d.duel ? (
          <span className="text-xs text-muted">
            @{d.duel.creator?.username ?? "—"} vs @{d.duel.opponent?.username ?? "—"}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key:    "game",
      header: "Game",
      render: (d) => (
        <span className="text-xs text-faint">{GAME_LABELS[d.duel?.game ?? ""] ?? "—"}</span>
      ),
    },
    {
      key:    "stake",
      header: "Stake",
      render: (d) =>
        d.duel ? (
          <span className="tabular-nums text-xs text-fg">
            {(Number(d.duel.stakeLamports) / LAMPORTS).toFixed(4)} SOL
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key:      "createdAt",
      header:   "Opened",
      sortable: true,
      render:   (d) => (
        <span className="tabular-nums text-xs text-faint">
          {new Date(d.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key:    "reason",
      header: "Reason",
      render: (d) => (
        <span className="max-w-[160px] truncate text-xs text-muted">
          {d.reason ?? "—"}
        </span>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key:    "actions",
      header: "",
      render: (d) =>
        ["OPEN", "UNDER_REVIEW"].includes(d.status) ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setResolving(d) }}
            className="rounded-md bg-rival/15 px-2.5 py-1 text-xs font-medium text-rival transition-colors hover:bg-rival/25 hover:text-rival"
          >
            Resolve
          </button>
        ) : (
          <span className="text-xs text-faint">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-heading-1 text-fg">Disputes</h1>
        <p className="mt-0.5 text-body-sm text-muted">
          Review and resolve duel disputes raised by players or the verification engine.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Open disputes"
          value={openCount}
          deltaPositive={openCount === 0 || undefined}
          delta={openCount === 0 ? "All clear" : undefined}
          icon={<Flag className="h-4 w-4" />}
        />
        <StatCard
          label="Total disputes"
          value={filter === "all" ? meta.total : "—"}
          sublabel="all time"
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface/60 p-0.5">
          {([["open", "Open only"], ["all", "All"]] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setFilter(v); setPage(1) }}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === v
                  ? "bg-rival text-rival-fg"
                  : "text-muted hover:text-fg",
              ].join(" ")}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-caption text-faint">
          {meta.total.toLocaleString()} disputes
        </span>
      </div>

      {/* Table */}
      {!loading && disputes.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-5 w-5" />}
          title="No disputes found"
          description={filter === "open" ? "No open disputes right now — all clear." : "No disputes match your filter."}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={disputes}
          rowKey={(d) => d.id}
          loading={loading}
          pagination={{
            page:   meta.page,
            total:  meta.total,
            limit:  meta.limit,
            onPage: (p) => setPage(p),
          }}
        />
      )}

      {/* Resolve modal */}
      {resolving && (
        <ResolveModal
          dispute={resolving}
          onSave={handleResolve}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  )
}
