/**
 * Notification rendering — converts a RealtimeEvent into the human-readable
 * `Notification` shown in the bell dropdown, toasts, and /notifications page.
 *
 * Pure and client-safe. Used for BOTH live SSE events and persisted events
 * hydrated from GET /api/notifications, so notification copy lives here and
 * only here.
 */

import type { RealtimeEvent, RealtimeEventKind } from '@/lib/realtime/types'

export interface Notification {
  id: string
  kind: RealtimeEventKind
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  read: boolean
  receivedAt: Date
}

// ─── Notification factory ─────────────────────────────────────────────────────

export function toNotification(
  event: RealtimeEvent,
  playerTag: string | null,
): Notification | null {
  const base = {
    id: event.id,
    kind: event.kind,
    read: false,
    receivedAt: new Date(event.occurredAt),
  }

  switch (event.kind) {
    case 'duel.accepted':
      return {
        ...base,
        title: 'Duel Accepted',
        description: `Your duel against ${event.challengerTag} is now active. Good luck!`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'duel.expired':
      return {
        ...base,
        title: 'Duel Expired',
        description: `Duel #${event.duelId.slice(0, 8)} expired. ${event.refundedSol} SOL has been refunded.`,
        actionLabel: 'Create new duel',
        actionHref: '/duels/create',
      }

    case 'verification.started':
      return {
        ...base,
        title: 'Verification Started',
        description: `We're checking the battle log for your duel against ${
          playerTag === event.player1Tag ? event.player2Tag : event.player1Tag
        }.`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'verification.completed': {
      const isWinner = playerTag !== null && event.winnerTag === playerTag

      if (event.status === 'verified' && isWinner) {
        return {
          ...base,
          title: 'You Won! 🏆',
          description: `Victory confirmed — your reward is on its way.`,
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      if (event.status === 'verified' && !isWinner) {
        return {
          ...base,
          title: 'Match Verified',
          description: `${event.winnerTag ?? 'Opponent'} won the duel. Better luck next time!`,
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      if (event.status === 'disputed') {
        return {
          ...base,
          title: 'Duel Disputed',
          description: 'Automatic verification could not confirm a result. Our team will review this duel.',
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      if (event.status === 'refunded') {
        return {
          ...base,
          title: 'Duel Refunded',
          description: 'This duel could not be verified in time, so your stake has been returned in full.',
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }

      // timeout — window elapsed with no matching battle; routed to review.
      return {
        ...base,
        title: 'Duel Timed Out',
        description: 'No matching battle was found within the verification window. Our team will review this duel.',
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }
    }

    case 'reward.paid':
      return {
        ...base,
        title: 'Reward Received',
        description: `+${event.amountSol} SOL added to your wallet (${event.feeSol} SOL platform fee deducted).`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'dispute.raised':
      return {
        ...base,
        title: event.postSettlement ? 'Result Contested' : 'Duel Disputed',
        description: event.postSettlement
          ? `${event.raisedByTag ?? 'Your opponent'} has contested the result of your duel. Our team will review it — related payouts are paused until then.`
          : `${event.raisedByTag ?? 'Your opponent'} reported a problem with your duel. Settlement is frozen while our team reviews the match.`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }

    case 'dispute.resolved': {
      const isWinner = playerTag !== null && event.winnerTag === playerTag

      if (event.resolution === 'RESOLVED_REFUND') {
        return {
          ...base,
          title: 'Dispute Resolved — Refunded',
          description: 'Our team reviewed the dispute and voided the duel. Both stakes have been returned in full.',
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }
      if (event.resolution === 'REJECTED') {
        return {
          ...base,
          title: 'Dispute Resolved',
          description: event.winnerTag
            ? `Our team reviewed the dispute and the original result stands — ${event.winnerTag} won the duel.`
            : 'Our team reviewed the dispute and closed it. The duel outcome is unchanged.',
          actionLabel: 'View duel',
          actionHref: `/duels/${event.duelId}`,
        }
      }
      // RESOLVED_CREATOR_WIN / RESOLVED_OPPONENT_WIN
      return {
        ...base,
        title: isWinner ? 'Dispute Resolved — You Won 🏆' : 'Dispute Resolved',
        description: isWinner
          ? 'Our team reviewed the dispute and ruled in your favor. The pot has been credited to your wallet.'
          : `Our team reviewed the dispute and ruled the duel for ${event.winnerTag ?? 'your opponent'}.`,
        actionLabel: 'View duel',
        actionHref: `/duels/${event.duelId}`,
      }
    }

    case 'tournament.started':
      return {
        ...base,
        title: 'Tournament Started',
        description: `${event.name} has begun with ${event.playerCount} players. Check the bracket!`,
        actionLabel: 'View bracket',
        actionHref: `/tournaments/${event.tournamentId}`,
      }

    case 'tournament.match_ready':
      return {
        ...base,
        title: 'Your Match Is Ready',
        description: `Round ${event.roundNumber}: ${event.player1Tag} vs ${event.player2Tag}. Time to play!`,
        actionLabel: 'View match',
        actionHref: `/tournaments/${event.tournamentId}`,
      }

    case 'tournament.match_completed':
      return {
        ...base,
        title: 'Match Completed',
        description: `Round ${event.roundNumber} result: ${event.winnerTag} advances to the next round.`,
        actionLabel: 'View bracket',
        actionHref: `/tournaments/${event.tournamentId}`,
      }

    case 'tournament.completed': {
      const isChampion = playerTag !== null && event.winnerTag === playerTag
      return {
        ...base,
        title: isChampion ? '🏆 Tournament Champion!' : 'Tournament Complete',
        description: isChampion
          ? `You won ${event.name} and ${event.prizePoolSol} SOL!`
          : `${event.name} has ended. ${event.winnerTag} takes the trophy and ${event.prizePoolSol} SOL.`,
        actionLabel: 'View results',
        actionHref: `/tournaments/${event.tournamentId}`,
      }
    }

    default:
      return null
  }
}
