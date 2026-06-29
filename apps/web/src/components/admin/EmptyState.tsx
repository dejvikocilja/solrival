import { type ReactNode } from "react"

interface EmptyStateProps {
  icon?:        ReactNode
  title:        string
  description?: string
  action?:      ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface/60 text-faint">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="mt-1 text-xs text-faint">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
