'use client'

import { useEffect, useId, useRef } from "react"

interface ConfirmModalProps {
  title:        string
  description:  string
  confirmLabel?: string
  onConfirm:    () => void | Promise<void>
  onClose:      () => void
  danger?:      boolean
  loading?:     boolean
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
  danger   = false,
  loading  = false,
}: ConfirmModalProps) {
  const titleId   = useId()
  const descId    = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Trap focus inside modal
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )
    focusable[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose()
      if (e.key === "Tab") {
        const first = focusable[0]
        const last  = focusable[focusable.length - 1]
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
          e.preventDefault()
          ;(e.shiftKey ? last : first)?.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [loading, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">{title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={loading}
            onClick={onClose}
            className="mt-0.5 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p id={descId} className="text-sm text-zinc-400 leading-relaxed">{description}</p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            aria-busy={loading}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-violet-600 hover:bg-violet-500",
            ].join(" ")}
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Working…
              </>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
