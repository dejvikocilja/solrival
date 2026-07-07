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
  // Supercell tags (with #). Null when a participant never linked a game
  // account for this game — such a duel is structurally unverifiable and is
  // refunded once its window elapses rather than left ACTIVE forever.
  creatorPlayerTag: string | null
  opponentPlayerTag: string | null
  acceptedAt: Date
}

// ─── DB loader ──────────────────────────────────────────────────────────────

/**
 * Loads the duel + both players' linked game-account tags and the rule's
 * canonical mode. Returns null only when the duel doesn't exist or isn't in a
 * verifiable lifecycle state (ACTIVE / VERIFYING) with an opponent — i.e. there
 * is genuinely nothing for the sweep to act on. A duel that IS in-flight but is
 * missing player tags is still returned (with null tags) so the sweep can time
 * it out and refund it rather than leave it ACTIVE indefinitely.
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

  return {
    id: duel.id,
    status: duel.status as 'ACTIVE' | 'VERIFYING',
    game: duel.game,
    gameMode: duel.rule.mode,
    creatorId: duel.creatorId,
    opponentId: duel.opponentId,
    creatorPlayerTag: duel.creatorGameAccount?.inGameTag ?? null,
    opponentPlayerTag: duel.opponentGameAccount?.inGameTag ?? null,
    acceptedAt: duel.acceptedAt,
  }
}

// ─── Winner mapping + settlement ──────────────────────────────────────────────

const normTag = (t: string) => t.toUpperCase().replace(/^#?/, '#')

/** Maps a detected winner tag to the winning user id, or null for a draw/unknown. */
function resolveWinnerId(duel: DuelRow, winnerTag: string | null): string | null {
  if (!winnerTag) return null
  // Tags are always present on the verified path, but the type allows null
  // (unverifiable duels); without both we cannot attribute a winner.
  if (duel.creatorPlayerTag === null || duel.opponentPlayerTag === null) return null
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

function buildContext(duel: DuelRow, creatorTag: string, opponentTag: string): DuelVerificationContext {
  const acceptedAt = duel.acceptedAt
  const timeoutAt = new Date(acceptedAt.getTime() + TIMEOUT_MINUTES * 60 * 1_000)

  return {
    duelId: duel.id,
    gameId: toGameId(duel.game),
    gameMode: duel.gameMode,
    player1Tag: creatorTag,
    player2Tag: opponentTag,
    acceptedAt,
    timeoutAt,
  }
}

/** The verification deadline for a duel (acceptedAt + validity window). */
function deadlineFor(duel: DuelRow): Date {
  return new Date(duel.acceptedAt.getTime() + TIMEOUT_MINUTES * 60 * 1_000)
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
 * The verification window (`acceptedAt + DUEL_VALIDITY_WINDOW_MIN`) is a hard
 * deadline enforced for EVERY in-flight duel, independent of whether battle
 * verification can run — so no duel can sit ACTIVE indefinitely:
 *
 *  - battle found                        → settle the winner (or refund a draw) → 'verified'
 *  - past deadline, tags present, no battle → mark DISPUTED + open a dispute    → 'timeout'
 *  - past deadline, tags missing         → refund both stakes (unverifiable)    → 'refunded'
 *  - before deadline, tags missing       → 'verifying' (bounded; refunds at the deadline)
 *  - before deadline, no battle yet      → 'verifying' (left for the next sweep tick)
 *  - not in a verifiable state           → 'error'
 */
export async function verifyDuelOnce(duelId: string): Promise<VerificationResult> {
  const duel = await loadDuelRow(duelId)
  if (duel === null) return errorResult(duelId, 'Duel not found or not in a verifiable state')

  // Events without a targetUserId broadcast to EVERY connected client, so all
  // verification events are published once per participant — other users must
  // never receive (or infer) another duel's progress or outcome.
  const notifyParticipants = (publish: (targetUserId: string) => void): void => {
    publish(duel.creatorId)
    publish(duel.opponentId)
  }

  const creatorTag = duel.creatorPlayerTag
  const opponentTag = duel.opponentPlayerTag

  const deadline = deadlineFor(duel)
  const pastDeadline = Date.now() >= deadline.getTime()

  // ── Hard deadline: resolve terminally so nothing stays in-flight forever ──
  if (pastDeadline) {
    if (creatorTag !== null && opponentTag !== null) {
      // Both players linked accounts but no matching battle appeared in the
      // window — a possible no-show. Keep funds locked and route to admin.
      const ctx = buildContext(duel, creatorTag, opponentTag)
      const reason = `No matching battle found within the verification window (expired ${deadline.toISOString()})`
      await markDuelDisputed(duel.id)
      await openDispute(ctx, reason)
      notifyParticipants((targetUserId) =>
        publishVerificationCompleted({ duelId, winnerTag: null, status: 'timeout', battleTime: null, targetUserId }),
      )
      return { duelId, status: 'timeout', winnerTag: null, battle: null, verifiedAt: new Date(), failureReason: reason }
    }

    // Structurally unverifiable (a participant never linked a game account):
    // there is no data to judge a winner, so refund both stakes in full. This
    // is the deterministic, self-serve outcome — no admin, no funds stranded.
    const reason = `Verification window elapsed with no linked game accounts to match against (expired ${deadline.toISOString()})`
    await applyDuelRefund(duel.id)
    console.warn({ msg: 'verify_duel_refunded_unverifiable', duelId, reason })
    notifyParticipants((targetUserId) =>
      publishVerificationCompleted({ duelId, winnerTag: null, status: 'refunded', battleTime: null, targetUserId }),
    )
    return { duelId, status: 'refunded', winnerTag: null, battle: null, verifiedAt: new Date(), failureReason: reason }
  }

  // ── Before the deadline ──
  // Nothing to verify yet without both tags; the duel is bounded by the
  // deadline above, so it will refund rather than hang if tags never appear.
  if (creatorTag === null || opponentTag === null) return verifyingResult(duelId)

  const ctx = buildContext(duel, creatorTag, opponentTag)

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
          player1Tag: creatorTag,
          player2Tag: opponentTag,
          targetUserId,
        }),
      )
    }
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
