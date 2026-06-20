'use client'

import { useCallback, useEffect, useState } from "react"
import { DataTable, type Column } from "@/components/admin/DataTable"
import { StatusBadge }  from "@/components/admin/StatusBadge"
import { EmptyState }   from "@/components/admin/EmptyState"
import { ConfirmModal } from "@/components/admin/ConfirmModal"
import { Trophy }       from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminTournament {
  id:                string
  name:              string
  game:              string
  status:            string
  format:            string
  maxParticipants:   number
  entryFeeLamports:  string
  prizePoolLamports: string
  startTime:         string
  createdAt:         string
  _count:            { players: number; matches: number }
  createdByAdmin:    { username: string } | null
  winner:            { username: string } | null
  rule:              { displayName: string } | null
}

const LAMPORTS = 1_000_000_000

function lamportsToSol(l: string) {
  return (Number(l) / LAMPORTS).toFixed(4)
}

const GAME_LABELS: Record<string, string> = {
  CLASH_ROYALE: "Clash Royale",
  BRAWL_STARS:  "Brawl Stars",
}

type ConfirmAction = { id: string; name: string; action: "cancel" | "start" }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<AdminTournament[]>([])
  const [loading,     setLoading]     = useState(true)
  const [confirm,     setConfirm]     = useState<ConfirmAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchTournaments = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/admin/tournaments")
      const json = await res.json()
      setTournaments(json.data ?? [])
    } catch {
      setTournaments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchTournaments() }, [fetchTournaments])

  async function handleAction() {
    if (!confirm) return
    setActionLoading(true)
    try {
      await fetch(`/api/admin/tournaments/${confirm.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: confirm.action }),
      })
      setConfirm(null)
      void fetchTournaments()
    } finally {
      setActionLoading(false)
    }
  }

  const columns: Column<AdminTournament>[] = [
    {
      key:      "name",
      header:   "Tournament",
      sortable: true,
      render:   (t) => (
        <div>
          <p className="font-medium text-zinc-200">{t.name}</p>
          <p className="text-xs text-zinc-500">{t.rule?.displayName ?? "—"}</p>
        </div>
      ),
    },
    {
      key:    "game",
      header: "Game",
      render: (t) => (
        <span className="text-xs text-zinc-400">{GAME_LABELS[t.game] ?? t.game}</span>
      ),
    },
    {
      key:    "players",
      header: "Players",
      render: (t) => (
        <span className="tabular-nums text-zinc-300">
          {t._count.players} / {t.maxParticipants}
        </span>
      ),
    },
    {
      key:      "entryFeeLamports",
      header:   "Buy-in",
      sortable: true,
      render:   (t) => (
        <span className="tabular-nums text-zinc-300">
          {lamportsToSol(t.entryFeeLamports)} SOL
        </span>
      ),
    },
    {
      key:      "prizePoolLamports",
      header:   "Prize Pool",
      sortable: true,
      render:   (t) => (
        <span className="tabular-nums font-medium text-emerald-400">
          {lamportsToSol(t.prizePoolLamports)} SOL
        </span>
      ),
    },
    {
      key:      "startTime",
      header:   "Starts",
      sortable: true,
      render:   (t) => (
        <span className="tabular-nums text-xs text-zinc-400">
          {new Date(t.startTime).toLocaleDateString()}
        </span>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key:    "actions",
      header: "Actions",
      render: (t) => {
        const canStart = ["REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(t.status)
        const canCancel = !["COMPLETED", "CANCELLED"].includes(t.status)
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {canStart && (
              <button
                type="button"
                onClick={() => setConfirm({ id: t.id, name: t.name, action: "start" })}
                className="rounded-md bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-900/60"
              >
                Start
              </button>
            )}
            <a
              href={`/tournaments/${t.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-md bg-zinc-800/80 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              Bracket ↗
            </a>
            {canCancel && (
              <button
                type="button"
                onClick={() => setConfirm({ id: t.id, name: t.name, action: "cancel" })}
                className="rounded-md bg-red-950/60 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/60"
              >
                Cancel
              </button>
            )}
          </div>
        )
      },
    },
  ]

  const confirmMeta =
    confirm?.action === "start"
      ? {
          title:       `Start "${confirm.name}"`,
          description: "This will generate the bracket and move the tournament to In Progress. Ensure registration is closed and the player count is correct. This action cannot be undone.",
          label:       "Start tournament",
        }
      : confirm
      ? {
          title:       `Cancel "${confirm.name}"`,
          description: "This permanently cancels the tournament. Players may need to be manually refunded. This action cannot be undone.",
          label:       "Cancel tournament",
        }
      : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-semibold text-zinc-100">Tournaments</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Manage tournament lifecycle — start brackets, view standings, and cancel events.
        </p>
      </div>

      {/* Table */}
      {!loading && tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-5 w-5" />}
          title="No tournaments yet"
          description="Create a tournament from the platform configuration panel."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={tournaments}
          rowKey={(t) => t.id}
          loading={loading}
        />
      )}

      {/* Confirm modal */}
      {confirm && confirmMeta && (
        <ConfirmModal
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.label}
          danger={confirm.action === "cancel"}
          loading={actionLoading}
          onConfirm={handleAction}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
