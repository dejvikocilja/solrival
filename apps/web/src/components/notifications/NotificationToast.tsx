'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Coins, Swords, Trophy, X } from 'lucide-react'
import type { Notification } from '@/hooks/useNotifications'
import type { RealtimeEventKind } from '@/lib/realtime/types'

type Accent = { border: string; bar: string; icon: string }

const ACCENT: Record<string, Accent> = {
  duel: { border: 'border-l-rival', bar: 'bg-rival', icon: 'text-rival' },
  verification: { border: 'border-l-cr', bar: 'bg-cr', icon: 'text-cr' },
  reward: { border: 'border-l-victory', bar: 'bg-victory', icon: 'text-victory' },
  tournament: { border: 'border-l-ember', bar: 'bg-ember', icon: 'text-ember' },
}

function accentFor(kind: RealtimeEventKind): Accent {
  if (kind.startsWith('duel.')) return ACCENT['duel']!
  if (kind.startsWith('verification.')) return ACCENT['verification']!
  if (kind === 'reward.paid') return ACCENT['reward']!
  return ACCENT['tournament']!
}

function IconForKind({ kind, className }: { kind: RealtimeEventKind; className?: string }) {
  if (kind.startsWith('duel.')) return <Swords className={className} aria-hidden />
  if (kind.startsWith('verification.')) return <BadgeCheck className={className} aria-hidden />
  if (kind === 'reward.paid') return <Coins className={className} aria-hidden />
  return <Trophy className={className} aria-hidden />
}

export interface NotificationToastProps {
  notification: Notification
  onClose: (id: string) => void
  /** Duration in ms for the auto-dismiss progress bar. Default: 5000 */
  dismissMs?: number
}

export function NotificationToast({ notification, onClose, dismissMs = 5_000 }: NotificationToastProps) {
  const accent = accentFor(notification.kind)
  const progressRef = useRef<HTMLDivElement>(null)

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
      className={`relative flex w-80 flex-col overflow-hidden rounded-lg border border-l-4 border-border ${accent.border} bg-bg-raised shadow-card-hover animate-fade-up`}
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <IconForKind kind={notification.kind} className={`mt-0.5 h-4 w-4 shrink-0 ${accent.icon}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-fg">{notification.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{notification.description}</p>
          {notification.actionLabel && notification.actionHref && (
            <Link
              href={notification.actionHref}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rival transition-colors hover:brightness-110"
              onClick={() => onClose(notification.id)}
            >
              {notification.actionLabel}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onClose(notification.id)}
          className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-fg focus-visible:focus-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="h-0.5 w-full bg-surface-2">
        <div ref={progressRef} className={`h-full ${accent.bar}`} />
      </div>
    </div>
  )
}
