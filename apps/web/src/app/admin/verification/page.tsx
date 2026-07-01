'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { DataTable, type Column } from "@/components/admin/DataTable"
import { StatusBadge }  from "@/components/admin/StatusBadge"
import { StatCard }     from "@/components/admin/StatCard"
import { EmptyState }   from "@/components/admin/EmptyState"
import { ShieldCheck }  from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface VJob {
  id:          string
  duelId:      string
  status:      string
  attempts:    number
  updatedAt:   string
  startedAt:   string | null
  completedAt: string | null
  lastError:   string | null
  duel: {
    id:       string
    shortCode: string
    game:     string
    creator:  { username: string } | null
    opponent: { username: string } | null
  } | null
}

interface Stats {
  activeCount:     number
  pendingCount:    number
  failedCount:     number
  avgResolutionMs: number | null
}

interface Meta { total: number; page: number; limit: number }

const POLL_INTERVAL_MS = 10_000

const STATUS_OPTIONS = [
  { value: "all",       label: "All" },
  { value: "verifying", label: "Verifying" },
  { value: "verified",  label: "Verified" },
  { value: "timeout",   label: "Timeout" },
  { value: "error",     label: "Error" },
]

const GAME_LABELS: Record<string, string> = {
  CLASH_ROYALE: "CR",
  BRAWL_STARS:  "BS",
}

function fmtDuration(ms: number) {
  if (ms < 60_000)  return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminVerificationPage() {
  const [jobs,    setJobs]    = useState<VJob[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [meta,    setMeta]    = useState<Meta>({ total: 0, page: 1, limit: 25 })
  const [loading, setLoading] = useState(true)
  const [status,  setStatus]  = useState("all")
  const [page,    setPage]    = useState(1)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchJobs = useCallback(async (s: string, p: number, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams({ status: s, page: String(p), limit: "25" })
      const res    = await fetch(`/api/admin/verification?${params}`)
      const json   = await res.json()
      setJobs(json.data   ?? [])
      setMeta(json.meta   ?? { total: 0, page: p, limit: 25 })
      setStats(json.stats ?? null)
      setLastUpdated(new Date())
    } catch {
      /* swallow — keep stale data on poll errors */
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Initial load + status/page changes
  useEffect(() => {
    void fetchJobs(status, page)
  }, [status, page, fetchJobs])

  // 10-second polling — silent refresh in background
  useEffect(() => {
    pollRef.current = setInterval(() => {
      void fetchJobs(status, page, true)
    }, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, page, fetchJobs])

  async function rerunVerification(jobId: string) {
    // TODO: wire up /api/admin/verification/:id/rerun once the verifier queue
    // supports ad-hoc re-queue (set status back to QUEUED, bump maxAttempts).
    await fetch(`/api/admin/verification/${jobId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "rerun" }),
    })
    void fetchJobs(status, page)
  }

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns: Column<VJob>[] = [
    {
      key:    "duelId",
      header: "Duel",
      render: (j) => (
        <span className="font-mono text-xs text-fg">{j.duel?.shortCode ?? j.duelId.slice(0, 8)}</span>
      ),
    },
    {
      key:    "game",
      header: "Game",
      render: (j) => (
        <span className="text-xs text-muted">{GAME_LABELS[j.duel?.game ?? ""] ?? "—"}</span>
      ),
    },
    {
      key:    "player1",
      header: "Player 1",
      render: (j) => (
        <span className="text-fg">@{j.duel?.creator?.username ?? "—"}</span>
      ),
    },
    {
      key:    "player2",
      header: "Player 2",
      render: (j) =>
        j.duel?.opponent ? (
          <span className="text-fg">@{j.duel.opponent.username}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key:      "attempts",
      header:   "Polls",
      sortable: true,
      render:   (j) => (
        <span className="tabular-nums text-muted">{j.attempts}</span>
      ),
    },
    {
      key:      "updatedAt",
      header:   "Last checked",
      sortable: true,
      render:   (j) => (
        <span className="tabular-nums text-xs text-faint">
          {new Date(j.updatedAt).toLocaleTimeString()}
        </span>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      key:    "actions",
      header: "",
      render: (j) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void rerunVerification(j.id) }}
          className="rounded-md bg-surface-2/80 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Re-run
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-heading-1 text-fg">Verification</h1>
          <p className="mt-0.5 text-body-sm text-muted">
            Live verification job monitor — polling every 10 seconds.
          </p>
        </div>
        {lastUpdated && (
          <p className="flex-shrink-0 rounded-md bg-surface-2/60 px-2.5 py-1.5 text-xs text-faint">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active verifications"
          value={stats?.activeCount ?? "—"}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Pending polls"
          value={stats?.pendingCount ?? "—"}
        />
        <StatCard
          label="Failed (last 24h)"
          value={stats?.failedCount ?? "—"}
          deltaPositive={stats ? stats.failedCount === 0 : undefined}
        />
        <StatCard
          label="Avg resolution"
          value={
            stats?.avgResolutionMs != null
              ? fmtDuration(stats.avgResolutionMs)
              : "—"
          }
          sublabel="verified jobs today"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface/60 p-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { setStatus(o.value); setPage(1) }}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                status === o.value
                  ? "bg-rival text-rival-fg"
                  : "text-muted hover:text-fg",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-caption text-faint">
          {meta.total.toLocaleString()} jobs
        </span>
      </div>

      {/* Table */}
      {!loading && jobs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title="No verification jobs"
          description="Jobs appear here once duels enter the ACTIVE state."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={jobs}
          rowKey={(j) => j.id}
          loading={loading}
          pagination={{
            page:   meta.page,
            total:  meta.total,
            limit:  meta.limit,
            onPage: (p) => setPage(p),
          }}
        />
      )}
    </div>
  )
}
