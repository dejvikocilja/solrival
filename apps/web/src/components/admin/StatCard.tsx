import { type ReactNode } from "react"

interface StatCardProps {
  label:          string
  value:          string | number
  delta?:         string          // e.g. "+12% vs last week"
  deltaPositive?: boolean         // true = violet/green, false = red
  icon?:          ReactNode
  sublabel?:      string
}

export function StatCard({ label, value, delta, deltaPositive, icon, sublabel }: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/60 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2/80 text-muted">
            {icon}
          </span>
        )}
      </div>

      <div>
        <p className="font-display text-2xl font-semibold tabular-nums text-fg">{value}</p>
        {sublabel && <p className="mt-0.5 text-xs text-faint">{sublabel}</p>}
      </div>

      {delta && (
        <p
          className={[
            "text-xs font-medium",
            deltaPositive === true  ? "text-victory" :
            deltaPositive === false ? "text-danger"     :
            "text-faint",
          ].join(" ")}
        >
          {delta}
        </p>
      )}
    </div>
  )
}
