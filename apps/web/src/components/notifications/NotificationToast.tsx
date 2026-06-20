'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import type { Notification } from '@/hooks/useNotifications'
import type { RealtimeEventKind } from '@/lib/realtime/types'

// ─── Colour mapping ───────────────────────────────────────────────────────────

type Accent = {
  border: string
  dot: string
  icon: string
}

const ACCENT: Record<string, Accent> = {
  duel: {
    border: 'border-l-violet-500',
    dot: 'bg-violet-500',
    icon: 'text-violet-400',
  },
  verification: {
    border: 'border-l-blue-500',
    dot: 'bg-blue-500',
    icon: 'text-blue-400',
  },
  reward: {
    border: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-400',
  },
  tournament: {
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    icon: 'text-amber-400',
  },
}

function accentFor(kind: RealtimeEventKind): Accent {
  if (kind.startsWith('duel.')) return ACCENT['duel']!
  if (kind.startsWith('verification.')) return ACCENT['verification']!
  if (kind === 'reward.paid') return ACCENT['reward']!
  return ACCENT['tournament']!
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconForKind({ kind, className }: { kind: RealtimeEventKind; className?: string }) {
  if (kind.startsWith('duel.')) {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M5 10h10M10 5l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind.startsWith('verification.')) {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M7 10l2.5 2.5L13 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  }
  if (kind === 'reward.paid') {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 7v6M8 9h3a1 1 0 110 2H9a1 1 0 100 2h3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  // tournament
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 3l1.8 3.6L16 7.3l-3 2.9.7 4.1L10 12.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L10 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface NotificationToastProps {
  notification: Notification
  onClose: (id: string) => void
  /** Duration in ms for the auto-dismiss progress bar. Default: 5000 */
  dismissMs?: number
}

export function NotificationToast({
  notification,
  onClose,
  dismissMs = 5_000,
}: NotificationToastProps) {
  const accent = accentFor(notification.kind)
  const progressRef = useRef<HTMLDivElement>(null)

  // Animate progress bar depletion
  useEffect(() => {
    const el = progressRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.width = '100%'

    const raf = requestAnimationFrame(() => {
      el.style.transition = `width ${dismissMs}ms linear`
      el.style.width = '0%'
    })

    return () => cancelAnimationFrame(raf)
  }, [dismissMs])

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        relative flex w-80 flex-col gap-1 overflow-hidden rounded-lg
        border border-zinc-700/60 border-l-4 ${accent.border}
        bg-zinc-900 shadow-lg shadow-black/40
        animate-in slide-in-from-bottom-2 fade-in duration-200
      `}
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {/* Icon */}
        <IconForKind
          kind={notification.kind}
          className={`mt-0.5 h-4 w-4 flex-shrink-0 ${accent.icon}`}
        />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            {notification.title}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 leading-relaxed">
            {notification.description}
          </p>
          {notification.actionLabel && notification.actionHref && (
            <Link
              href={notification.actionHref}
              className="mt-2 inline-block text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
              onClick={() => onClose(notification.id)}
            >
              {notification.actionLabel} →
            </Link>
          )}
        </div>

        {/* Close button */}
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onClose(notification.id)}
          className="flex-shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-zinc-800">
        <div
          ref={progressRef}
          className={`h-full ${accent.dot.replace('bg-', 'bg-')}`}
        />
      </div>
    </div>
  )
}
