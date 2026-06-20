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
  const [confirmDuel, setConfirmDuel] = useState<{ id: string; action: "cancel" | "force-refund" } | null>(null)
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
        <span className="font-mono text-xs text-zinc-300">{d.shortCode}</span>
      ),
    },
    {
      key:    "creator",
      header: "Creator",
      render: (d) => (
        <span className="text-zinc-300">@{d.creator?.username ?? "—"}</span>
      ),
    },
    {
      key:    "opponent",
      header: "Challenger",
      render: (d) =>
        d.opponent ? (
          <span className="text-zinc-300">@{d.opponent.username}</span>
        ) : (
          <span className="text-zinc-600">—</span>
        ),
    },
    {
      key:    "game",
      header: "Game",
      render: (d) => (
        <span className="text-xs text-zinc-400">{GAME_LABELS[d.game] ?? d.game}</span>
      ),
    },
    {
      key:      "stakeLamports",
      header:   "Stake",
      sortable: true,
      render:   (d) => (
        <span className="tabular-nums text-zinc-200">{lamportsToSol(d.stakeLamports)} SOL</span>
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
        <span className="tabular-nums text-xs text-zinc-500">
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
            label="Cancel"
            danger
            onClick={() => setConfirmDuel({ id: d.id, action: "cancel" })}
            disabled={["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED"].includes(d.status)}
          />
          <ActionButton
            label="Refund"
            onClick={() => setConfirmDuel({ id: d.id, action: "force-refund" })}
            disabled={d.status === "REFUNDED"}
          />
        </div>
      ),
    },
  ]

  const confirmMeta =
    confirmDuel?.action === "cancel"
      ? {
          title:       "Cancel duel",
          description: "This will immediately cancel the duel and prevent any further actions. The on-chain escrow may still hold funds — a separate refund step may be needed.",
          label:       "Cancel duel",
        }
      : {
          title:       "Force refund",
          description: "This marks the duel as refunded. Ensure the on-chain escrow has been closed and funds returned to both players before confirming.",
          label:       "Force refund",
        }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-zinc-100">Duels</h1>
        <p className="text-sm text-zinc-500">
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
        <span className="ml-auto text-xs text-zinc-600">
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
          danger={confirmDuel.action === "cancel"}
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
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
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
          ? "bg-red-950/60 text-red-400 hover:bg-red-900/60"
          : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
      ].join(" ")}
    >
      {label}
    </button>
  )
}
