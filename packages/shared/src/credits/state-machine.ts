/**
 * Withdrawal lifecycle state machine. Single source of truth for legal
 * transitions, shared by the web services and the treasury payout worker.
 * Mirrors the WithdrawalStatus enum in packages/db (keep in sync).
 *
 * Funds are locked the moment a request is created. They only ever LEAVE the
 * platform on COMPLETED. REJECTED and FAILED both revert the lock back to the
 * user's available balance, so money is never stranded.
 */

export const WITHDRAWAL_STATUSES = [
  "PENDING_REVIEW",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "FAILED",
] as const;

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/** Allowed transitions. Empty array => terminal state. */
const TRANSITIONS: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  // Held for admin because the user has an active dispute.
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  // Auto-approved (no dispute) or admin-approved; queued for treasury payout.
  APPROVED: ["PROCESSING", "REJECTED"],
  // Treasury transfer submitted to chain.
  PROCESSING: ["COMPLETED", "FAILED"],
  // On-chain payout failed; lock reverted, may be retried by re-approving.
  FAILED: ["APPROVED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
};

export function canTransition(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isWithdrawalTerminal(status: WithdrawalStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export class WithdrawalStateError extends Error {
  status = 409;
  code = "WITHDRAWAL_STATE";
  constructor(
    public readonly from: WithdrawalStatus,
    public readonly to: WithdrawalStatus,
  ) {
    super(`Illegal withdrawal transition: ${from} -> ${to}`);
    this.name = "WithdrawalStateError";
  }
}

export function assertWithdrawalTransition(from: WithdrawalStatus, to: WithdrawalStatus): void {
  if (!canTransition(from, to)) throw new WithdrawalStateError(from, to);
}

/** Statuses whose funds are reverted to available when the request ends here. */
export const WITHDRAWAL_REVERTING_STATUSES: readonly WithdrawalStatus[] = ["REJECTED", "FAILED"];

/** Statuses an admin must act on. */
export const WITHDRAWAL_REVIEW_STATUSES: readonly WithdrawalStatus[] = ["PENDING_REVIEW"];

/** Statuses the treasury payout worker should pick up. */
export const WITHDRAWAL_PAYABLE_STATUSES: readonly WithdrawalStatus[] = ["APPROVED"];
