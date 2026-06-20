/**
 * Public entry point for duel verification.
 *
 * `verifyDuel(duelId)` is the single function callers should invoke.
 * It loads the duel's verification context, tries an immediate battle lookup,
 * and either returns a verified result or starts the background poller.
 *
 * Usage in a Next.js API route:
 * ```ts
 * import { verifyDuel } from '@/api/verification/verify'
 *
 * const result = await verifyDuel(duelId)
 * ```
 */

import { prisma } from '@solrival/db'
import type { DuelVerificationContext, VerificationResult, BattleRecord } from '@/lib/verification/types'
import { findMatchingBattle, toGameId } from '@/lib/verification/verification-engine'
import { startVerificationPoller } from '@/lib/verification/poller'
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initiates or resumes verification for the given duel.
 *
 * Behaviour:
 *  - If a matching battle already exists in the battle log → returns
 *    `{ status: 'verified', winnerTag, battle }` immediately.
 *  - If no battle has been played yet → starts a background poller and returns
 *    `{ status: 'verifying' }`. The caller should persist this status and
 *    register the `onVerificationComplete` webhook / callback.
 *  - If the duel cannot be loaded → returns `{ status: 'error' }`.
 *  - If the Supercell API is unavailable (non-retryable) → returns
 *    `{ status: 'error' }`.
 *
 * @param duelId           - UUID of the duel to verify
 * @param onPollerResult   - Optional callback invoked when the background
 *                           poller reaches a terminal state. Ignored if the
 *                           battle is found on the first attempt.
 *                           TODO: replace with a DB update + webhook emit.
 */
export async function verifyDuel(
  duelId: string,
  onPollerResult?: (result: VerificationResult) => Promise<void>,
): Promise<VerificationResult> {
  // ── 1. Load duel context ──────────────────────────────────────────────────
  let duel: DuelRow | null

  try {
    duel = await loadDuelRow(duelId)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error({ msg: 'verify_duel_load_failed', duelId, error: reason })
    return errorResult(duelId, `Failed to load duel: ${reason}`)
  }

  if (duel === null) {
    console.error({ msg: 'verify_duel_not_found', duelId })
    return errorResult(duelId, 'Duel not found or not in ACCEPTED status')
  }

  const ctx = buildContext(duel)

  // ── 2. Immediate battle lookup ────────────────────────────────────────────
  let battle: BattleRecord | null = null

  try {
    battle = await findMatchingBattle(ctx)
  } catch (err) {
    if (err instanceof SupercellApiError && !err.retryable) {
      console.error({
        msg: 'verify_duel_api_error_non_retryable',
        duelId,
        statusCode: err.statusCode,
        reason: err.reason,
      })
      return errorResult(duelId, `Supercell API error (${err.statusCode}): ${err.reason}`)
    }

    // Retryable errors: fall through — poller will retry on the next tick
    console.warn({
      msg: 'verify_duel_api_error_retryable_starting_poller',
      duelId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  if (battle !== null) {
    console.info({
      msg: 'verify_duel_immediate_match',
      duelId,
      winnerTag: battle.winnerTag,
      battleTime: battle.battleTime.toISOString(),
    })
    const result = verifiedResult(ctx, battle)
    // Settle immediately: pay the winner the full pot (credits) or flag on-chain.
    await settleFromResult(duel, result)
    return result
  }

  // No immediate battle — move the duel into VERIFYING so its state reflects
  // that polling is underway (best-effort; settlement also accepts ACTIVE).
  await prisma.duel.updateMany({
    where: { id: duelId, status: 'ACTIVE' },
    data: { status: 'VERIFYING', verifyingAt: new Date() },
  })

  // ── 3. No battle yet — start background poller ────────────────────────────
  // Notify connected clients that verification has started
  publishVerificationStarted({
    duelId: ctx.duelId,
    gameId: ctx.gameId,
    player1Tag: ctx.player1Tag,
    player2Tag: ctx.player2Tag,
    // No targetUserId — broadcast to all authenticated clients; they filter by duelId
  })

  // Settlement always runs on the terminal result; any caller-supplied callback
  // is invoked afterwards (e.g. to persist UI state or emit a webhook).
  const terminalCallback = async (result: VerificationResult): Promise<void> => {
    await settleFromResult(duel, result)
    console.info({
      msg: 'poller_result_received',
      duelId,
      status: result.status,
      winnerTag: result.winnerTag,
    })
    if (onPollerResult) await onPollerResult(result)
  }

  startVerificationPoller(ctx, terminalCallback)

  console.info({ msg: 'verify_duel_poller_started', duelId })
  return verifyingResult(duelId)
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

  // Window expired → keep funds locked and route to admin review.
  if (Date.now() >= ctx.timeoutAt.getTime()) {
    const reason = `No matching battle found within the verification window (expired ${ctx.timeoutAt.toISOString()})`
    await markDuelDisputed(duel.id)
    await openDispute(ctx, reason)
    publishVerificationCompleted({ duelId, winnerTag: null, status: 'timeout', battleTime: null })
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
    publishVerificationCompleted({
      duelId,
      winnerTag: battle.winnerTag,
      status: 'verified',
      battleTime: battle.battleTime.toISOString(),
    })
    return result
  }

  return verifyingResult(duelId)
}
