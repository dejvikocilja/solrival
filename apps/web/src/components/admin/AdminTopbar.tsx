'use client'

import { usePathname } from "next/navigation"
import { type ReactNode } from "react"

const ROUTE_META: Record<string, { title: string; crumb: string }> = {
  "/admin/analytics":    { title: "Overview",     crumb: "Analytics" },
  "/admin/duels":        { title: "Duels",        crumb: "Duels" },
  "/admin/verification": { title: "Verification", crumb: "Verification" },
  "/admin/disputes":     { title: "Disputes",     crumb: "Disputes" },
  "/admin/tournaments":  { title: "Tournaments",  crumb: "Tournaments" },
}

interface AdminTopbarProps {
  onMenuClick: () => void
  actions?:    ReactNode
}

export function AdminTopbar({ onMenuClick, actions }: AdminTopbarProps) {
  const pathname = usePathname()
  const meta     = ROUTE_META[pathname] ?? { title: "Admin", crumb: "Admin" }

  return (
    <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-4 border-b border-border bg-bg/80 px-4 backdrop-blur-sm sm:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={onMenuClick}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <span className="text-faint">Admin</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="text-faint">
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-medium text-fg">{meta.crumb}</span>
      </nav>

      {/* Right slot */}
      <div className="ml-auto flex items-center gap-2">
        {actions}
      </div>
    </header>
  )
}
