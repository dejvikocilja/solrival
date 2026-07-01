'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  Swords,
  ShieldCheck,
  Flag,
  Trophy,
  Banknote,
} from "lucide-react"

interface NavItem {
  href:  string
  label: string
  icon:  React.ReactNode
}

const NAV: NavItem[] = [
  { href: "/admin/analytics",    label: "Overview",      icon: <BarChart2   className="h-4 w-4" /> },
  { href: "/admin/duels",        label: "Duels",         icon: <Swords      className="h-4 w-4" /> },
  { href: "/admin/verification", label: "Verification",  icon: <ShieldCheck className="h-4 w-4" /> },
  { href: "/admin/disputes",     label: "Disputes",      icon: <Flag        className="h-4 w-4" /> },
  { href: "/admin/withdrawals",  label: "Withdrawals",   icon: <Banknote    className="h-4 w-4" /> },
  { href: "/admin/tournaments",  label: "Tournaments",   icon: <Trophy      className="h-4 w-4" /> },
]

interface AdminSidebarProps {
  open:    boolean
  onClose: () => void
}

export function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const pathname = usePathname()

  const sidebar = (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-bg">
      {/* Logo */}
      <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-border px-5">
        <Link
          href="/admin/analytics"
          className="flex items-center gap-2 focus-visible:focus-ring rounded-md"
          onClick={onClose}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rival text-rival-fg">
            <Swords className="h-4 w-4" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
            Sol<span className="text-rival">Rival</span>
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted align-middle">
              Admin
            </span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5" role="list">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={[
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-rival/20 text-rival ring-1 ring-rival/30"
                      : "text-muted hover:bg-surface-2/60 hover:text-fg",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={[
                      "flex-shrink-0 transition-colors",
                      active ? "text-rival" : "text-faint",
                    ].join(" ")}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <Link
          href="/marketplace"
          className="flex items-center gap-2 text-xs text-faint transition-colors hover:text-muted"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M5 2L1 6L5 10M1 6H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to marketplace
        </Link>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        {sidebar}
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          {/* Drawer */}
          <div className="relative flex-shrink-0">{sidebar}</div>
        </div>
      )}
    </>
  )
}
