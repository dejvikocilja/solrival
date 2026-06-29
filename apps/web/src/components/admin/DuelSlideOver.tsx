'use client'

import { useEffect, useState } from "react"
import { StatusBadge } from "./StatusBadge"

interface DuelDetail {
  id:            string
  shortCode:     string
  game:          string
  visibility:    string
  status:        string
  stakeLamports: string
  platformFeeBps: number
  escrowPda:     string | null
  expiresAt:     string
  acceptedAt:    string | null
  createdAt:     string
  creator:       { id: string; username: string; walletAddress: string } | null
  opponent:      { id: string; username: string; walletAddress: string } | null
  winner:        { id: string; username: string; walletAddress: string } | null
  rule:          { displayName: string; template: string } | null
  verificationJob: {
    status:      string
    attempts:    number
    completedAt: string | null
    lastError:   string | null
  } | null
  dispute: {
    id:     string
    status: string
    reason: string | null
  } | null
}

interface DuelSlideOverProps {
  duelId:  string | null
  onClose: () => void
}

const LAMPORTS = 1_000_000_000

function lamportsToSol(lamports: string | bigint) {
  return (Number(lamports) / LAMPORTS).toFixed(4)
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="flex-shrink-0 text-xs text-faint">{label}</span>
      <span className="text-right text-xs font-medium text-fg">{value}</span>
    </div>
  )
}

export function DuelSlideOver({ duelId, onClose }: DuelSlideOverProps) {
  const [data,    setData]    = useState<DuelDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!duelId) { setData(null); return }
    setLoading(true)
    setError(null)
    fetch(`/api/admin/duels/${duelId}`)
      .then((r) => r.json())
      .then((j) => setData(j.data))
      .catch(() => setError("Failed to load duel details"))
      .finally(() => setLoading(false))
  }, [duelId])

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose])

  if (!duelId) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal
        aria-label="Duel details"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-fg">Duel Details</h2>
            {data && (
              <p className="mt-0.5 font-mono text-xs text-faint">{data.shortCode}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-4 rounded bg-surface-2" style={{ width: `${60 + (i % 3) * 15}%` }} />
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {data && !loading && (
            <div className="space-y-5">
              {/* Status + game */}
              <div className="flex items-center gap-2">
                <StatusBadge status={data.status} />
                <span className="rounded-md bg-surface-2/60 px-2 py-0.5 text-xs font-medium text-muted">
                  {data.game.replace("_", " ")}
                </span>
                <span className="rounded-md bg-surface-2/60 px-2 py-0.5 text-xs font-medium text-muted">
                  {data.visibility}
                </span>
              </div>

              {/* Core info */}
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Overview</h3>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface/40 px-4">
                  <Row label="Duel ID"      value={<span className="font-mono">{data.id.slice(0, 8)}…</span>} />
                  <Row label="Stake"        value={`${lamportsToSol(data.stakeLamports)} SOL`} />
                  <Row label="Platform fee" value={`${(data.platformFeeBps / 100).toFixed(1)}%`} />
                  <Row label="Rule"         value={data.rule?.displayName ?? "—"} />
                  <Row label="Created"      value={new Date(data.createdAt).toLocaleString()} />
                  {data.acceptedAt && (
                    <Row label="Accepted"   value={new Date(data.acceptedAt).toLocaleString()} />
                  )}
                  <Row label="Expires"      value={new Date(data.expiresAt).toLocaleString()} />
                </div>
              </section>

              {/* Players */}
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Players</h3>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface/40 px-4">
                  <Row
                    label="Creator"
                    value={
                      data.creator ? (
                        <span>
                          <span className="text-fg">@{data.creator.username}</span>{" "}
                          <span className="text-faint">{shortAddr(data.creator.walletAddress)}</span>
                        </span>
                      ) : "—"
                    }
                  />
                  <Row
                    label="Challenger"
                    value={
                      data.opponent ? (
                        <span>
                          <span className="text-fg">@{data.opponent.username}</span>{" "}
                          <span className="text-faint">{shortAddr(data.opponent.walletAddress)}</span>
                        </span>
                      ) : <span className="text-faint">—</span>
                    }
                  />
                  {data.winner && (
                    <Row
                      label="Winner"
                      value={
                        <span className="text-victory">@{data.winner.username}</span>
                      }
                    />
                  )}
                </div>
              </section>

              {/* Verification */}
              {data.verificationJob && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Verification</h3>
                  <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface/40 px-4">
                    <Row label="Job status" value={<StatusBadge status={data.verificationJob.status} />} />
                    <Row label="Attempts"   value={String(data.verificationJob.attempts)} />
                    {data.verificationJob.completedAt && (
                      <Row label="Completed" value={new Date(data.verificationJob.completedAt).toLocaleString()} />
                    )}
                    {data.verificationJob.lastError && (
                      <Row label="Last error" value={
                        <span className="text-danger break-all">{data.verificationJob.lastError}</span>
                      } />
                    )}
                  </div>
                </section>
              )}

              {/* Dispute */}
              {data.dispute && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Dispute</h3>
                  <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface/40 px-4">
                    <Row label="Status" value={<StatusBadge status={data.dispute.status} />} />
                    {data.dispute.reason && (
                      <Row label="Reason" value={data.dispute.reason} />
                    )}
                  </div>
                </section>
              )}

              {/* On-chain */}
              {data.escrowPda && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">On-Chain</h3>
                  <div className="rounded-xl border border-border bg-surface/40 px-4">
                    <Row
                      label="Escrow PDA"
                      value={
                        <a
                          href={`https://explorer.solana.com/address/${data.escrowPda}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-rival hover:text-rival transition-colors"
                        >
                          {shortAddr(data.escrowPda)}↗
                        </a>
                      }
                    />
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
