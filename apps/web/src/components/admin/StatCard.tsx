import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  /** Short trend note, e.g. "+12% vs last week" or "Live". */
  delta?: string
  /** true → victory green, false → danger red, undefined → faint. */
  deltaPositive?: boolean
  icon?: ReactNode
  sublabel?: string
  /** Accent for the icon chip. Defaults to a neutral surface chip. */
  accent?: "neutral" | "rival" | "victory" | "ember"
}

const ACCENT_CHIP: Record<NonNullable<StatCardProps["accent"]>, string> = {
  neutral: "bg-surface-2 text-muted",
  rival: "bg-rival/12 text-rival",
  victory: "bg-victory/12 text-victory",
  ember: "bg-ember/12 text-ember",
}

export function StatCard({
  label,
  value,
  delta,
  deltaPositive,
  icon,
  sublabel,
  accent = "neutral",
}: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption uppercase tracking-wide text-faint">{label}</p>
        {icon ? (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              ACCENT_CHIP[accent],
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div>
        <p className="font-display text-heading-1 tabular text-fg">{value}</p>
        {sublabel ? <p className="mt-0.5 text-caption text-faint">{sublabel}</p> : null}
      </div>

      {delta ? (
        <p
          className={cn(
            "text-caption font-medium",
            deltaPositive === true
              ? "text-victory"
              : deltaPositive === false
                ? "text-danger"
                : "text-faint",
          )}
        >
          {delta}
        </p>
      ) : null}
    </div>
  )
}
