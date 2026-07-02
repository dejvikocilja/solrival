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
