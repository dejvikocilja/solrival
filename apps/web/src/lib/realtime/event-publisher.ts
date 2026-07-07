/**
 * Typed publish functions for each realtime event kind.
 *
 * Each function adds `id` (UUID) and `occurredAt` (ISO timestamp) automatically.
 * Callers only supply domain-specific fields.
 *
 * Usage:
 * ```ts
 * import { publishDuelAccepted } from '@/lib/realtime/event-publisher'
 *
 * publishDuelAccepted({ duelId, creatorTag, challengerTag, gameId, stakeSol })
 * ```
 */

import { getEventBus } from './event-bus'
import { persistNotification } from '@/server/services/notifications/service'
import type {
  RealtimeEvent,
  DuelAcceptedEvent,
  DuelExpiredEvent,
  VerificationStartedEvent,
  VerificationCompletedEvent,
  RewardPaidEvent,
  DisputeRaisedEvent,
  DisputeResolvedEvent,
  TournamentStartedEvent,
  TournamentMatchReadyEvent,
  TournamentMatchCompletedEvent,
  TournamentCompletedEvent,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function meta(): { id: string; occurredAt: string } {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  }
}

/**
 * Single choke point for every publish: persist targeted events (so the bell
 * survives refreshes — fire-and-forget, never blocks), then fan out on the
 * in-process bus for live SSE delivery.
 */
function dispatch(event: RealtimeEvent): void {
  persistNotification(event)
  getEventBus().publish(event)
}

// ─── Publishers ───────────────────────────────────────────────────────────────

export function publishDuelAccepted(
  payload: Omit<DuelAcceptedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'duel.accepted', ...payload })
}

export function publishDuelExpired(
  payload: Omit<DuelExpiredEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'duel.expired', ...payload })
}

export function publishVerificationStarted(
  payload: Omit<VerificationStartedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'verification.started', ...payload })
}

export function publishVerificationCompleted(
  payload: Omit<VerificationCompletedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'verification.completed', ...payload })
}

export function publishRewardPaid(
  payload: Omit<RewardPaidEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'reward.paid', ...payload })
}

export function publishDisputeRaised(
  payload: Omit<DisputeRaisedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'dispute.raised', ...payload })
}

export function publishDisputeResolved(
  payload: Omit<DisputeResolvedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'dispute.resolved', ...payload })
}

export function publishTournamentStarted(
  payload: Omit<TournamentStartedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'tournament.started', ...payload })
}

export function publishTournamentMatchReady(
  payload: Omit<TournamentMatchReadyEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'tournament.match_ready', ...payload })
}

export function publishTournamentMatchCompleted(
  payload: Omit<TournamentMatchCompletedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'tournament.match_completed', ...payload })
}

export function publishTournamentCompleted(
  payload: Omit<TournamentCompletedEvent, 'id' | 'kind' | 'occurredAt'>,
): void {
  dispatch({ ...meta(), kind: 'tournament.completed', ...payload })
}
