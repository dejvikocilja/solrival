import { type ReactNode } from "react"

interface BadgeConfig {
  label:  string
  className: string
}

const CONFIG: Record<string, BadgeConfig> = {
  // ── Duel (DB uppercase) ──────────────────────────────────────────────────
  CREATED:              { label: "Created",       className: "bg-zinc-800/80 text-zinc-400 border-zinc-700" },
  WAITING_FOR_OPPONENT: { label: "Open",          className: "bg-blue-950/60 text-blue-400 border-blue-800/60" },
  ACCEPTED:             { label: "Accepted",      className: "bg-violet-950/60 text-violet-400 border-violet-800/60" },
  ACTIVE:               { label: "Active",        className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60" },
  VERIFYING:            { label: "Verifying",     className: "bg-violet-950/60 text-violet-400 border-violet-800/60" },
  COMPLETED:            { label: "Completed",     className: "bg-zinc-800/60 text-zinc-400 border-zinc-700/60" },
  EXPIRED:              { label: "Expired",       className: "bg-zinc-800/50 text-zinc-500 border-zinc-700/50" },
  CANCELLED:            { label: "Cancelled",     className: "bg-red-950/60 text-red-400 border-red-900/60" },
  DISPUTED:             { label: "Disputed",      className: "bg-amber-950/60 text-amber-400 border-amber-800/60" },
  REFUNDED:             { label: "Refunded",      className: "bg-zinc-800/60 text-zinc-400 border-zinc-700/60" },
  // ── Verification job ────────────────────────────────────────────────────
  QUEUED:               { label: "Queued",        className: "bg-zinc-800/80 text-zinc-400 border-zinc-700" },
  RUNNING:              { label: "Running",       className: "bg-violet-950/60 text-violet-400 border-violet-800/60" },
  SUCCEEDED:            { label: "Verified",      className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60" },
  FAILED:               { label: "Failed",        className: "bg-red-950/60 text-red-400 border-red-900/60" },
  RETRYING:             { label: "Retrying",      className: "bg-amber-950/60 text-amber-400 border-amber-800/60" },
  DEAD_LETTER:          { label: "Dead Letter",   className: "bg-red-950/60 text-red-400 border-red-900/60" },
  // ── Tournament ──────────────────────────────────────────────────────────
  DRAFT:                { label: "Draft",         className: "bg-zinc-800/60 text-zinc-400 border-zinc-700/60" },
  REGISTRATION_OPEN:    { label: "Registration",  className: "bg-blue-950/60 text-blue-400 border-blue-800/60" },
  REGISTRATION_CLOSED:  { label: "Reg. Closed",   className: "bg-amber-950/60 text-amber-400 border-amber-800/60" },
  IN_PROGRESS:          { label: "In Progress",   className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60" },
  // ── Dispute ─────────────────────────────────────────────────────────────
  OPEN:                 { label: "Open",          className: "bg-amber-950/60 text-amber-400 border-amber-800/60" },
  UNDER_REVIEW:         { label: "Under Review",  className: "bg-violet-950/60 text-violet-400 border-violet-800/60" },
  RESOLVED_CREATOR_WIN: { label: "Resolved",      className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60" },
  RESOLVED_OPPONENT_WIN:{ label: "Resolved",      className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60" },
  RESOLVED_REFUND:      { label: "Refunded",      className: "bg-zinc-800/60 text-zinc-400 border-zinc-700/60" },
  REJECTED:             { label: "Rejected",      className: "bg-red-950/60 text-red-400 border-red-900/60" },
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps): ReactNode {
  const cfg = CONFIG[status] ?? { label: status, className: "bg-zinc-800/60 text-zinc-400 border-zinc-700/60" }
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
        cfg.className,
        className,
      ].join(" ")}
    >
      {cfg.label}
    </span>
  )
}
