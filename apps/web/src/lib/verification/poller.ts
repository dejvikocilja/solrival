/**
 * Verification poller.
 *
 * Runs an interval-based polling loop for a single duel, calling
 * `findMatchingBattle` on every tick until:
 *
 *  - A matching battle is found → calls `onResult` with `status: 'verified'`
 *  - `timeoutAt` is reached → calls `onResult` with `status: 'timeout'`
 *  - `stop()` is called externally (e.g. duel cancelled)
 *
 * Errors on individual poll ticks are logged and swallowed — the poller
 * continues to the next interval so a single API blip cannot kill the job.
 */

import type { DuelVerificationContext, VerificationResult } from './types'
import { findMatchingBattle } from './verification-engine'
import { openDispute } from './dispute-handler'
import { publishVerificationCompleted } from '@/lib/realtime/event-publisher'
import { registerPoller, deregisterPoller, isPollerActive } from './poller-registry'

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = (() => {
  const raw = process.env['VERIFICATION_POLL_INTERVAL_MS']
  if (raw) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  // Fallback: 30 seconds (spec default)
  return 30_000
})()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PollerHandle {
  /** Stops the poller. Safe to call multiple times. */
  stop: () => void
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildVerifiedResult(
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

function buildTimeoutResult(ctx: DuelVerificationContext): VerificationResult {
  return {
    duelId: ctx.duelId,
    status: 'timeout',
    winnerTag: null,
    battle: null,
    verifiedAt: new Date(),
    failureReason: `No matching battle found within the verification window (expired at ${ctx.timeoutAt.toISOString()})`,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts a polling loop that checks for a matching battle every
 * `VERIFICATION_POLL_INTERVAL_MS` milliseconds.
 *
 * The returned `PollerHandle` lets the caller stop the loop early (e.g. if
 * the duel is cancelled while verification is in progress).
 *
 * @param ctx      - Duel context used for each `findMatchingBattle` call
 * @param onResult - Async callback invoked exactly once with the final result
 * @returns        A handle with a `stop()` method
 */
/**
 * Starts a polling loop that checks for a matching battle every
 * `VERIFICATION_POLL_INTERVAL_MS` milliseconds.
 *
 * Returns `null` if a poller for this duel is already running (H-001/H-002).
 */
export function startVerificationPoller(
  ctx: DuelVerificationContext,
  onResult: (result: VerificationResult) => Promise<void>,
): PollerHandle | null {
  // Dedup guard — reject duplicate pollers for the same duel (H-002).
  if (isPollerActive(ctx.duelId)) {
    console.warn({ msg: 'poller_already_active_skipped', duelId: ctx.duelId })
    return null
  }

  let stopped = false
  let handle: ReturnType<typeof setInterval> | null = null

  const finish = async (result: VerificationResult): Promise<void> => {
    if (stopped) return
    stopped = true
    if (handle !== null) {
      clearInterval(handle)
      handle = null
    }
    deregisterPoller(ctx.duelId)

    // Open a dispute for non-verified terminal states
    if (result.status === 'timeout' || result.status === 'disputed') {
      try {
        await openDispute(ctx, result.failureReason ?? result.status)
      } catch (err) {
        console.error({
          msg: 'poller_open_dispute_failed',
          duelId: ctx.duelId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Publish realtime event for terminal states
    if (result.status === 'verified' || result.status === 'timeout' || result.status === 'disputed') {
      publishVerificationCompleted({
        duelId: ctx.duelId,
        winnerTag: result.winnerTag,
        status: result.status === 'verified' ? 'verified' : result.status === 'disputed' ? 'disputed' : 'timeout',
        battleTime: result.battle?.battleTime.toISOString() ?? null,
        // No targetUserId — broadcast to all authenticated clients; they filter by duelId
      })
    }

    try {
      await onResult(result)
    } catch (err) {
      console.error({
        msg: 'poller_on_result_callback_threw',
        duelId: ctx.duelId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const tick = async (): Promise<void> => {
    if (stopped) return

    // Check timeout first — avoids one spurious API call after expiry
    if (Date.now() >= ctx.timeoutAt.getTime()) {
      console.info({
        msg: 'poller_timeout_reached',
        duelId: ctx.duelId,
        timeoutAt: ctx.timeoutAt.toISOString(),
      })
      await finish(buildTimeoutResult(ctx))
      return
    }

    try {
      const battle = await findMatchingBattle(ctx)
      if (battle !== null) {
        console.info({
          msg: 'poller_battle_found',
          duelId: ctx.duelId,
          battleTime: battle.battleTime.toISOString(),
          winnerTag: battle.winnerTag,
        })
        await finish(buildVerifiedResult(ctx, battle))
      } else {
        console.info({
          msg: 'poller_no_battle_yet',
          duelId: ctx.duelId,
          nextPollIn: DEFAULT_POLL_INTERVAL_MS,
        })
      }
    } catch (err) {
      // Log and continue — do not crash the poller
      console.error({
        msg: 'poller_tick_error',
        duelId: ctx.duelId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    }
  }

  // Run an immediate first tick, then set up the interval
  void tick()
  handle = setInterval(() => void tick(), DEFAULT_POLL_INTERVAL_MS)

  const pollerHandle: PollerHandle = {
    stop: () => {
      if (stopped) return
      stopped = true
      if (handle !== null) {
        clearInterval(handle)
        handle = null
      }
      deregisterPoller(ctx.duelId)
      console.info({ msg: 'poller_stopped_externally', duelId: ctx.duelId })
    },
  }

  // Register after building the handle so stop() is available immediately.
  registerPoller(ctx.duelId, pollerHandle)

  console.info({
    msg: 'poller_started',
    duelId: ctx.duelId,
    gameId: ctx.gameId,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
    timeoutAt: ctx.timeoutAt.toISOString(),
  })

  return pollerHandle
}
