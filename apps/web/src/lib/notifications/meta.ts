import { Swords, ShieldCheck, Wallet, Trophy, type LucideIcon } from 'lucide-react'
import type { RealtimeEventKind } from '@/lib/realtime/types'

export interface NotificationAccent {
  icon: LucideIcon
  /** Small status-dot class, used in the compact dropdown row. */
  dotClass: string
  /** Icon-chip background + foreground, used in the full-page row. */
  chipClass: string
}

/**
 * One accent per event family. Duels are the primary "action" color, verification
 * uses the CR teal (a neutral in-progress/system signal), payouts use the money
 * green, and tournaments use ember to stand apart from 1v1 duels.
 */
export function notificationAccent(kind: RealtimeEventKind): NotificationAccent {
  if (kind.startsWith('duel.')) {
    return { icon: Swords, dotClass: 'bg-rival', chipClass: 'bg-rival/12 text-rival' }
  }
  if (kind.startsWith('verification.')) {
    return { icon: ShieldCheck, dotClass: 'bg-cr', chipClass: 'bg-cr/12 text-cr' }
  }
  if (kind === 'reward.paid') {
    return { icon: Wallet, dotClass: 'bg-victory', chipClass: 'bg-victory/12 text-victory' }
  }
  // tournament.*
  return { icon: Trophy, dotClass: 'bg-ember', chipClass: 'bg-ember/12 text-ember' }
}
