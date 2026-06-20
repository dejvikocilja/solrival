'use client'

import { useState, type ReactNode } from "react"
import { AdminSidebar } from "./AdminSidebar"
import { AdminTopbar }  from "./AdminTopbar"

export function AdminShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-screen-2xl p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
