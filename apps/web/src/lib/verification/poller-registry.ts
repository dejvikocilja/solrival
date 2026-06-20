/**
 * Poller registry — tracks active verification pollers in-process.
 *
 * Prevents double-poller creation for the same duel (H-001, H-002 audit
 * findings). On server restart the registry is empty; a startup recovery sweep
 * should re-enqueue any duels still in VERIFYING/QUEUED/RETRYING status.
 *
 * NOTE: This is an in-process singleton. For horizontal scaling, replace with
 * a distributed lock (Redis SETNX) so only one instance polls per duel.
 */

export interface PollerHandle {
  stop: () => void
}

const activePollers = new Map<string, PollerHandle>()

/**
 * Register a poller for a duel.
 *
 * @returns `true` if registered successfully, `false` if one already exists.
 */
export function registerPoller(duelId: string, handle: PollerHandle): boolean {
  if (activePollers.has(duelId)) return false
  activePollers.set(duelId, handle)
  return true
}

/**
 * Remove the poller entry for a duel (called on stop/timeout/error).
 */
export function deregisterPoller(duelId: string): void {
  activePollers.delete(duelId)
}

/**
 * Returns `true` if a poller is currently active for the given duel.
 */
export function isPollerActive(duelId: string): boolean {
  return activePollers.has(duelId)
}

/**
 * Returns all currently active duel IDs (for diagnostics / admin).
 */
export function getActivePollerDuelIds(): string[] {
  return Array.from(activePollers.keys())
}
