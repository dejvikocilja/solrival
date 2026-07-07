/**
 * Duel lifecycle state machine. Single source of truth for legal transitions,
 * shared by the web services and the verifier. Mirrors the DuelStatus enum in
 * packages/db (keep in sync).
 */

export const DUEL_STATUSES = [
  "CREATED",
  "WAITING_FOR_OPPONENT",
  "ACCEPTED",
  "ACTIVE",
  "VERIFYING",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "DISPUTED",
  "REFUNDED",
] as const;

export type DuelStatus = (typeof DUEL_STATUSES)[number];

/** Allowed transitions. Empty array => terminal state. */
const TRANSITIONS: Record<DuelStatus, readonly DuelStatus[]> = {
  CREATED: ["WAITING_FOR_OPPONENT", "CANCELLED", "EXPIRED"],
  WAITING_FOR_OPPONENT: ["ACCEPTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["ACTIVE", "DISPUTED", "REFUNDED"],
  // ACTIVE → REFUNDED: a duel with no verifiable result by its deadline (e.g.
  // no linked game accounts to match battles against) is refunded by the
  // verification sweep — no duel may stay in-flight indefinitely.
  ACTIVE: ["VERIFYING", "DISPUTED", "REFUNDED"],
  VERIFYING: ["COMPLETED", "DISPUTED", "REFUNDED"],
  DISPUTED: ["COMPLETED", "REFUNDED"],
  // COMPLETED is settled, not immutable: within the post-settlement dispute
  // window an admin may void the result (→ REFUNDED, with a full ledger
  // reversal). Overturning the winner keeps the duel COMPLETED (result stands,
  // just for the other player), so no other transition is needed.
  COMPLETED: ["REFUNDED"],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export const TERMINAL_STATUSES: readonly DuelStatus[] = (
  Object.keys(TRANSITIONS) as DuelStatus[]
).filter((s) => TRANSITIONS[s].length === 0);

export function isTerminal(status: DuelStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function nextStatuses(from: DuelStatus): readonly DuelStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: DuelStatus, to: DuelStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class DuelStateError extends Error {
  constructor(
    public readonly from: DuelStatus,
    public readonly to: DuelStatus,
  ) {
    super(`Illegal duel transition: ${from} -> ${to}`);
    this.name = "DuelStateError";
  }
}

export function assertTransition(from: DuelStatus, to: DuelStatus): void {
  if (!canTransition(from, to)) throw new DuelStateError(from, to);
}

/** Statuses at which a public duel is joinable from the marketplace. */
export const JOINABLE_STATUSES: readonly DuelStatus[] = ["WAITING_FOR_OPPONENT"];

/** Pre-acceptance statuses eligible for the expiry sweep. */
export const EXPIRABLE_STATUSES: readonly DuelStatus[] = ["CREATED", "WAITING_FOR_OPPONENT"];
