'use client'

import { useCallback, useEffect, useState } from "react"
import { DataTable, type Column } from "@/components/admin/DataTable"
import { StatusBadge }   from "@/components/admin/StatusBadge"
import { EmptyState }    from "@/components/admin/EmptyState"
import { ConfirmModal }  from "@/components/admin/ConfirmModal"
import { DuelSlideOver } from "@/components/admin/DuelSlideOver"
import { Swords }        from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminDuel {
  id:            string
  shortCode:     string
  game:          string
  status:        string
  stakeLamports: string
  createdAt:     string
  creator:       { username: string } | null
  opponent:      { username: string } | null
  rule:          { displayName: string } | null
  verificationJob: { status: string } | null
  dispute:       { status: string } | null
}

interface Meta { total: number; page: number; limit: number }

const LAMPORTS = 1_000_000_000

function lamportsToSol(l: string) {
  return (Number(l) / LAMPORTS).toFixed(4)
}

const GAME_LABELS: Record<string, string> = {
  CLASH_ROYALE: "Clash Royale",
  BRAWL_STARS:  "Brawl Stars",
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "all",       label: "All statuses" },
  { value: "open",      label: "Open" },
  { value: "pending",   label: "Pending" },
  { value: "active",    label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "disputed",  label: "Disputed" },
]

const GAME_OPTIONS = [
  { value: "all",          label: "All games" },
  { value: "CLASH_ROYALE", label: "Clash Royale" },
  { value: "BRAWL_STARS",  label: "Brawl Stars" },
]

interface Filters {
  status: string
  game:   string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDuelsPage() {
  const [duels,       setDuels]       = useState<AdminDuel[]>([])
  const [meta,        setMeta]        = useState<Meta>({ total: 0, page: 1, limit: 25 })
  const [loading,     setLoading]     = useState(true)
  const [filters,     setFilters]     = useState<Filters>({ status: "all", game: "all" })
  const [page,        setPage]        = useState(1)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [confirmDuel, setConfirmDuel] = useState<{ id: string; action: "force-refund" } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchDuels = useCallback(async (f: Filters, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status: f.status,
        game:   f.game,
        page:   String(p),
        limit:  "25",
      })
      const res  = await fetch(`/api/admin/duels?${params}`)
      const json = await res.json()
      setDuels(json.data ?? [])
      setMeta(json.meta ?? { total: 0, page: p, limit: 25 })
    } catch {
      setDuels([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchDuels(filters, page)
  }, [filters, page, fetchDuels])

  function handleFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  async function handleAction() {
    if (!confirmDuel) return
    setActionLoading(true)
    try {
      await fetch(`/api/admin/duels/${confirmDuel.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: confirmDuel.action }),
      })
      setConfirmDuel(null)
      void fetchDuels(filters, page)
    } finally {
      setActionLoading(false)
    }
  }

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns: Column<AdminDuel>[] = [
    {
      key:    "shortCode",
      header: "Duel ID",
      render: (d) => (
        <span className="font-mono text-xs text-fg">{d.shortCode}</span>
      ),
    },
    {
      key:    "creator",
      header: "Creator",
      render: (d) => (
        <span className="text-fg">@{d.creator?.username ?? "—"}</span>
      ),
    },
    {
      key:    "opponent",
      header: "Challenger",
      render: (d) =>
        d.opponent ? (
          <span className="text-fg">@{d.opponent.username}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key:    "game",
      header: "Game",
      render: (d) => (
        <span className="text-xs text-muted">{GAME_LABELS[d.game] ?? d.game}</span>
      ),
    },
    {
      key:      "stakeLamports",
      header:   "Stake",
      sortable: true,
      render:   (d) => (
        <span className="tabular-nums text-fg">{lamportsToSol(d.stakeLamports)} SOL</span>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key:      "createdAt",
      header:   "Created",
      sortable: true,
      render:   (d) => (
        <span className="tabular-nums text-xs text-faint">
          {new Date(d.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      render: (d) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <ActionButton
            label="Refund"
            onClick={() => setConfirmDuel({ id: d.id, action: "force-refund" })}
            disabled={["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED"].includes(d.status)}
          />
        </div>
      ),
    },
  ]

  const confirmMeta = {
    title:       "Refund duel",
    description: "Returns every locked stake to the players' available balances and closes the duel as refunded. Idempotent and safe to retry.",
    label:       "Refund duel",
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-heading-1 text-fg">Duels</h1>
        <p className="text-body-sm text-muted">
          Manage all platform duels, cancel disputes, and force refunds.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.status}
          onChange={(v) => handleFilter("status", v)}
          options={STATUS_OPTIONS}
        />
        <Select
          value={filters.game}
          onChange={(v) => handleFilter("game", v)}
          options={GAME_OPTIONS}
        />
        <span className="ml-auto text-caption text-faint">
          {meta.total.toLocaleString()} duels
        </span>
      </div>

      {/* Table */}
      {!loading && duels.length === 0 ? (
        <EmptyState
          icon={<Swords className="h-5 w-5" />}
          title="No duels found"
          description="Try adjusting your filters."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={duels}
          rowKey={(d) => d.id}
          loading={loading}
          onRowClick={(d) => setSelectedId(d.id)}
          pagination={{
            page:   meta.page,
            total:  meta.total,
            limit:  meta.limit,
            onPage: (p) => setPage(p),
          }}
        />
      )}

      {/* Detail slide-over */}
      <DuelSlideOver
        duelId={selectedId}
        onClose={() => setSelectedId(null)}
      />

      {/* Confirm modal */}
      {confirmDuel && (
        <ConfirmModal
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.label}
          loading={actionLoading}
          onConfirm={handleAction}
          onClose={() => setConfirmDuel(null)}
        />
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Select({
  value,
  onChange,
  options,
}: {
  value:    string
  onChange: (v: string) => void
  options:  { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-rival/30 focus:ring-1 focus:ring-rival/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function ActionButton({
  label,
  onClick,
  danger    = false,
  disabled  = false,
}: {
  label:     string
  onClick:   () => void
  danger?:   boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        danger
          ? "bg-danger/15 text-danger hover:bg-danger/25"
          : "bg-surface-2/80 text-muted hover:bg-surface-2 hover:text-fg",
      ].join(" ")}
    >
      {label}
    </button>
  )
}
