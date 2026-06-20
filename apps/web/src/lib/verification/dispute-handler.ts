/**
 * Dispute handler for SolRival battle verification.
 *
 * Called when automatic verification cannot determine a winner — either
 * because the polling window expired (`timeout`) or because the engine
 * encountered irreconcilable data (`disputed`).
 *
 * All dispute records are persisted to the `disputes` Prisma table so the
 * admin panel (`/api/admin/disputes`) reads from the same data store.
 */

import { prisma } from '@solrival/db'
import type { DuelVerificationContext } from './types'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens a new dispute for the given duel.
 *
 * Idempotent per duel: if a dispute already exists for `ctx.duelId` the
 * existing row is returned unchanged (upsert with no-op on update).
 *
 * @param ctx    - The duel verification context that triggered the dispute
 * @param reason - Human-readable explanation (e.g. `'timeout'`, API error message)
 */
export async function openDispute(
  ctx: DuelVerificationContext,
  reason: string,
): Promise<{ id: string; duelId: string }> {
  const record = await prisma.dispute.upsert({
    where:  { duelId: ctx.duelId },
    update: {}, // already open — no-op
    create: {
      duelId: ctx.duelId,
      reason,
      status: 'OPEN',
    },
    select: { id: true, duelId: true },
  })

  console.info({
    msg: 'dispute_opened',
    disputeId: record.id,
    duelId: ctx.duelId,
    gameId: ctx.gameId,
    reason,
  })

  return record
}

/**
 * Resolves an existing dispute.
 *
 * @param disputeId          - ID returned by `openDispute`
 * @param resolvedByAdminId  - DB user ID of the admin performing the resolution
 * @param resolution         - Free-text resolution notes
 * @param outcome            - Terminal status to set on the dispute
 */
export async function resolveDispute(
  disputeId: string,
  resolvedByAdminId: string,
  resolution: string,
  outcome: 'RESOLVED_CREATOR_WIN' | 'RESOLVED_OPPONENT_WIN' | 'RESOLVED_REFUND' | 'REJECTED',
) {
  return prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status:              outcome,
      resolutionNotes:     resolution,
      resolvedByAdminId,
      resolvedAt:          new Date(),
    },
  })
}

/**
 * Returns all dispute records, ordered oldest-first.
 */
export function getDisputes() {
  return prisma.dispute.findMany({ orderBy: { createdAt: 'asc' } })
}

/**
 * Returns only the open disputes (status OPEN or UNDER_REVIEW), oldest-first.
 */
export function getOpenDisputes() {
  return prisma.dispute.findMany({
    where:   { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'asc' },
  })
}
