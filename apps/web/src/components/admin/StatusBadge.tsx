import { Badge, type BadgeProps } from "@/components/ui/badge"

type Tone = NonNullable<BadgeProps["tone"]>

// Maps every domain status (duel / verification job / tournament / dispute) onto
// the shared Badge tone system, so admin status pills match the rest of the app.
const TONE: Record<string, Tone> = {
  // Duel
  CREATED: "neutral",
  WAITING_FOR_OPPONENT: "rival",
  ACCEPTED: "rival",
  ACTIVE: "victory",
  VERIFYING: "rival",
  COMPLETED: "victory",
  EXPIRED: "neutral",
  CANCELLED: "danger",
  DISPUTED: "ember",
  REFUNDED: "neutral",
  // Verification job
  QUEUED: "neutral",
  RUNNING: "rival",
  SUCCEEDED: "victory",
  FAILED: "danger",
  RETRYING: "ember",
  DEAD_LETTER: "danger",
  // Tournament
  DRAFT: "neutral",
  REGISTRATION_OPEN: "rival",
  REGISTRATION_CLOSED: "ember",
  IN_PROGRESS: "victory",
  // Dispute
  OPEN: "ember",
  UNDER_REVIEW: "rival",
  RESOLVED_CREATOR_WIN: "victory",
  RESOLVED_OPPONENT_WIN: "victory",
  RESOLVED_REFUND: "neutral",
  REJECTED: "danger",
}

const LABEL: Record<string, string> = {
  WAITING_FOR_OPPONENT: "Open",
  REGISTRATION_OPEN: "Registration",
  REGISTRATION_CLOSED: "Reg. Closed",
  IN_PROGRESS: "In Progress",
  UNDER_REVIEW: "Under Review",
  RESOLVED_CREATOR_WIN: "Resolved",
  RESOLVED_OPPONENT_WIN: "Resolved",
  RESOLVED_REFUND: "Refunded",
  DEAD_LETTER: "Dead Letter",
  SUCCEEDED: "Verified",
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone = TONE[status] ?? "neutral"
  const label = LABEL[status] ?? titleCase(status)
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  )
}
