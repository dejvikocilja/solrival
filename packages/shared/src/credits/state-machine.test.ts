import { describe, it, expect } from "vitest";
import {
  WITHDRAWAL_STATUSES,
  canTransitionWithdrawal,
  isWithdrawalTerminal,
  assertWithdrawalTransition,
  WithdrawalStateError,
  WITHDRAWAL_REVERTING_STATUSES,
  WITHDRAWAL_PAYABLE_STATUSES,
  type WithdrawalStatus,
} from "./state-machine";

const EXPECTED: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING", "REJECTED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  FAILED: ["APPROVED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
};

describe("withdrawal state machine", () => {
  it("matches the expected transition table edge-for-edge", () => {
    for (const from of WITHDRAWAL_STATUSES) {
      for (const to of WITHDRAWAL_STATUSES) {
        expect(canTransitionWithdrawal(from, to), `${from} -> ${to}`).toBe(
          EXPECTED[from].includes(to),
        );
      }
    }
  });

  it("COMPLETED and REJECTED are terminal — money left, or lock reverted, exactly once", () => {
    expect(isWithdrawalTerminal("COMPLETED")).toBe(true);
    expect(isWithdrawalTerminal("REJECTED")).toBe(true);
    for (const to of WITHDRAWAL_STATUSES) {
      expect(canTransitionWithdrawal("COMPLETED", to)).toBe(false);
      expect(canTransitionWithdrawal("REJECTED", to)).toBe(false);
    }
  });

  it("a completed payout can never be re-queued or reverted", () => {
    // COMPLETED means SOL left the treasury — anything reachable from it would
    // risk paying twice or clawing back an on-chain transfer we can't undo.
    expect(WITHDRAWAL_REVERTING_STATUSES).not.toContain("COMPLETED");
    expect(canTransitionWithdrawal("COMPLETED", "APPROVED")).toBe(false);
  });

  it("only APPROVED is payable, and FAILED can be retried via re-approval", () => {
    expect([...WITHDRAWAL_PAYABLE_STATUSES]).toEqual(["APPROVED"]);
    expect(canTransitionWithdrawal("FAILED", "APPROVED")).toBe(true);
  });

  it("assertWithdrawalTransition throws a 409-coded error on illegal edges", () => {
    expect(() => assertWithdrawalTransition("APPROVED", "PROCESSING")).not.toThrow();
    try {
      assertWithdrawalTransition("COMPLETED", "PROCESSING");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(WithdrawalStateError);
      expect((e as WithdrawalStateError).status).toBe(409);
    }
  });
});
