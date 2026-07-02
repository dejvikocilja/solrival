/**
 * Duel verification — single-attempt, sweep-driven.
 *
 * `verifyDuelOnce(duelId)` performs one verification attempt and settles the
 * duel the moment a matching battle is found (or disputes it once its window
 * expires). It is invoked repeatedly by the cron sweep
 * (`runVerificationSweep` → POST /api/internal/duels/verify), which is the
 * production driver: no long-lived in-process poller, so it works on
 * serverless/short-lived runtimes and survives restarts.
 */

import { prisma } from '@solrival/db'
import type { DuelVerificationContext, VerificationResult, BattleRecord } from '@/lib/verification/types'
import { findMatchingBattle, toGameId } from '@/lib/verification/verification-engine'
import { openDispute } from '@/lib/verification/dispute-handler'
import { SupercellApiError } from '@/lib/verification/supercell-client'
import { publishVerificationStarted, publishVerificationCompleted } from '@/lib/realtime/event-publisher'
import {
  applyVerifiedWinner,
  applyDuelRefund,
  markDuelDisputed,
} from '@/server/services/duel/settlement'

// ─── Config ───────────────────────────────────────────────────────────────────

const TIMEOUT_MINUTES = (() => {
  const raw = process.env['DUEL_VALIDITY_WINDOW_MIN']
  if (raw) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 30
})()

// ─── Duel row ─────────────────────────────────────────────────────────────────

/**
 * The fields verification needs, plus the participant identities required to
 * map a detected winner tag back to a user and settle the duel.
 */
interface DuelRow {
  id: string
  status: 'ACTIVE' | 'VERIFYING'
  game: string              // 'CLASH_ROYALE' | 'BRAWL_STARS'
  gameMode: string          // rule.mode — the canonical in-game mode matched in the battle log
  creatorId: string
  opponentId: string
  creatorPlayerTag: string  // Supercell tag with #
  opponentPlayerTag: string // Supercell tag with #
  acceptedAt: Date
}

// ─── DB loader ──────────────────────────────────────────────────────────────

/**
 * Loads the duel + both players' linked game-account tags and the rule's
 * canonical mode. Returns null unless the duel is in a verifiable state
 * (ACTIVE or VERIFYING) and both players + tags are present.
 */
async function loadDuelRow(duelId: string): Promise<DuelRow | null> {
  const duel = await prisma.duel.findUnique({
    where: { id: duelId },
    include: {
      creatorGameAccount: { select: { inGameTag: true } },
      opponentGameAccount: { select: { inGameTag: true } },
      rule: { select: { mode: true } },
    },
  })

  if (!duel) return null
  if (duel.status !== 'ACTIVE' && duel.status !== 'VERIFYING') {
    console.warn({ msg: 'verify_duel_not_verifiable_status', duelId, status: duel.status })
    return null
  }
  if (!duel.opponentId || !duel.acceptedAt) return null

  const creatorTag = duel.creatorGameAccount?.inGameTag
  const opponentTag = duel.opponentGameAccount?.inGameTag
  if (!creatorTag || !opponentTag) {
    console.warn({ msg: 'verify_duel_missing_player_tags', duelId })
    return null
  }

  return {
    id: duel.id,
    status: duel.status as 'ACTIVE' | 'VERIFYING',
    game: duel.game,
    gameMode: duel.rule.mode,
    creatorId: duel.creatorId,
    opponentId: duel.opponentId,
    creatorPlayerTag: creatorTag,
    opponentPlayerTag: opponentTag,
    acceptedAt: duel.acceptedAt,
  }
}

// ─── Winner mapping + settlement ──────────────────────────────────────────────

const normTag = (t: string) => t.toUpperCase().replace(/^#?/, '#')

/** Maps a detected winner tag to the winning user id, or null for a draw/unknown. */
function resolveWinnerId(duel: DuelRow, winnerTag: string | null): string | null {
  if (!winnerTag) return null
  const w = normTag(winnerTag)
  if (w === normTag(duel.creatorPlayerTag)) return duel.creatorId
  if (w === normTag(duel.opponentPlayerTag)) return duel.opponentId
  return null
}

/**
 * Turns a terminal verification result into money movement via the settlement
 * orchestrator (which branches on the duel's funding mode). Idempotent.
 */
async function settleFromResult(duel: DuelRow, result: VerificationResult): Promise<void> {
  try {
    if (result.status === 'verified') {
      const winnerId = resolveWinnerId(duel, result.winnerTag)
      if (winnerId) {
        await applyVerifiedWinner(duel.id, winnerId)
      } else {
        // Draw or an unrecognised winner tag — refund both stakes rather than guess.
        await applyDuelRefund(duel.id)
      }
    } else if (result.status === 'timeout' || result.status === 'disputed') {
      // Keep funds locked; the poller has already opened a dispute for admin review.
      await markDuelDisputed(duel.id)
    }
    // 'error' is transient — leave the duel as-is for a later retry.
  } catch (err) {
    console.error({
      msg: 'verify_duel_settlement_failed',
      duelId: duel.id,
      status: result.status,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(duel: DuelRow): DuelVerificationContext {
  const acceptedAt = duel.acceptedAt
  const timeoutAt = new Date(acceptedAt.getTime() + TIMEOUT_MINUTES * 60 * 1_000)

  return {
    duelId: duel.id,
    gameId: toGameId(duel.game),
    gameMode: duel.gameMode,
    player1Tag: duel.creatorPlayerTag,
    player2Tag: duel.opponentPlayerTag,
    acceptedAt,
    timeoutAt,
  }
}

// ─── Result factories ─────────────────────────────────────────────────────────

function verifiedResult(
  ctx: DuelVerificationContext,
  battle: NonNullable<Awaited<ReturnType<typeof findMatchingBattle>>>,
): VerificationResult {
  return {
    duelId: ctx.duelId,
    status: 'verified',
    winnerTag: battle.winnerTag,
    battle,
    verifiedAt: new Date(),
    failureReason: null,
  }
}

function verifyingResult(duelId: string): VerificationResult {
  return {
    duelId,
    status: 'verifying',
    winnerTag: null,
    battle: null,
    verifiedAt: null,
    failureReason: null,
  }
}

function errorResult(duelId: string, reason: string): VerificationResult {
  return {
    duelId,
    status: 'error',
    winnerTag: null,
    battle: null,
    verifiedAt: new Date(),
    failureReason: reason,
  }
}

// ─── Single-shot verification (serverless / cron-friendly) ────────────────────

/**
 * Performs ONE verification attempt for a duel and settles immediately if a
 * battle is found — no in-process poller. This is the production path: a cron
 * sweep (`runVerificationSweep`) calls it for every active duel on each tick,
 * which works on serverless/short-lived runtimes where `setInterval` cannot.
 *
 * MUST run on the static-egress host (the Supercell API tokens are IP-locked).
 *
 *  - battle found            → settle the winner (or refund a draw) → 'verified'
 *  - past the timeout window → mark DISPUTED + open a dispute        → 'timeout'
 *  - no battle yet           → 'verifying' (left for the next sweep tick)
 *  - not in a verifiable state → 'error'
 */
export async function verifyDuelOnce(duelId: string): Promise<VerificationResult> {
  const duel = await loadDuelRow(duelId)
  if (duel === null) return errorResult(duelId, 'Duel not found or not in a verifiable state')

  const ctx = buildContext(duel)

  // Events without a targetUserId broadcast to EVERY connected client, so all
  // verification events are published once per participant — other users must
  // never receive (or infer) another duel's progress or outcome.
  const notifyParticipants = (publish: (targetUserId: string) => void): void => {
    publish(duel.creatorId)
    publish(duel.opponentId)
  }

  // First sweep visit: claim ACTIVE → VERIFYING (race-guarded — concurrent
  // sweeps or a racing dispute claim exactly once) and tell both players
  // verification has begun. Subsequent sweeps see VERIFYING and skip this.
  if (duel.status === 'ACTIVE') {
    const claimed = await prisma.duel.updateMany({
      where: { id: duel.id, status: 'ACTIVE' },
      data: { status: 'VERIFYING' },
    })
    if (claimed.count === 1) {
      notifyParticipants((targetUserId) =>
        publishVerificationStarted({
          duelId,
          gameId: ctx.gameId,
          player1Tag: duel.creatorPlayerTag,
          player2Tag: duel.opponentPlayerTag,
          targetUserId,
        }),
      )
    }
  }

  // Window expired → keep funds locked and route to admin review.
  if (Date.now() >= ctx.timeoutAt.getTime()) {
    const reason = `No matching battle found within the verification window (expired ${ctx.timeoutAt.toISOString()})`
    await markDuelDisputed(duel.id)
    await openDispute(ctx, reason)
    notifyParticipants((targetUserId) =>
      publishVerificationCompleted({ duelId, winnerTag: null, status: 'timeout', battleTime: null, targetUserId }),
    )
    return { duelId, status: 'timeout', winnerTag: null, battle: null, verifiedAt: new Date(), failureReason: reason }
  }

  let battle: BattleRecord | null = null
  try {
    battle = await findMatchingBattle(ctx)
  } catch (err) {
    if (err instanceof SupercellApiError && !err.retryable) {
      return errorResult(duelId, `Supercell API error (${err.statusCode}): ${err.reason}`)
    }
    return verifyingResult(duelId) // retryable — try again next sweep
  }

  if (battle !== null) {
    const result = verifiedResult(ctx, battle)
    await settleFromResult(duel, result)
    notifyParticipants((targetUserId) =>
      publishVerificationCompleted({
        duelId,
        winnerTag: battle.winnerTag,
        status: 'verified',
        battleTime: battle.battleTime.toISOString(),
        targetUserId,
      }),
    )
    return result
  }

  return verifyingResult(duelId)
}
