import { describe, it, expect } from "vitest";
import {
  DUEL_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  isTerminal,
  nextStatuses,
  assertTransition,
  DuelStateError,
  JOINABLE_STATUSES,
  EXPIRABLE_STATUSES,
  type DuelStatus,
} from "./state-machine";

/**
 * The complete legal-transition table, written out longhand. If a code change
 * alters ANY edge — adds one, drops one — this test fails and forces the
 * change to be deliberate. Money moves on these edges.
 */
const EXPECTED: Record<DuelStatus, readonly DuelStatus[]> = {
  CREATED: ["WAITING_FOR_OPPONENT", "CANCELLED", "EXPIRED"],
  WAITING_FOR_OPPONENT: ["ACCEPTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["ACTIVE", "DISPUTED", "REFUNDED"],
  ACTIVE: ["VERIFYING", "DISPUTED", "REFUNDED"], // REFUNDED: unverifiable-duel timeout
  VERIFYING: ["COMPLETED", "DISPUTED", "REFUNDED"],
  DISPUTED: ["COMPLETED", "REFUNDED"],
  COMPLETED: ["REFUNDED"], // admin void of a settled result (dispute window)
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
};

describe("duel state machine", () => {
  it("matches the expected transition table edge-for-edge", () => {
    for (const from of DUEL_STATUSES) {
      for (const to of DUEL_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(EXPECTED[from].includes(to));
      }
      expect([...nextStatuses(from)]).toEqual([...EXPECTED[from]]);
    }
  });

  it("keeps EXPIRED, CANCELLED, REFUNDED terminal — funds settled, no way back", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["CANCELLED", "EXPIRED", "REFUNDED"]);
    for (const s of TERMINAL_STATUSES) expect(isTerminal(s)).toBe(true);
  });

  it("never allows a settled duel to reopen for play or re-verification", () => {
    // The only exit from COMPLETED is the admin void; anything that would put
    // a paid-out duel back in flight must be impossible.
    for (const to of ["ACTIVE", "VERIFYING", "ACCEPTED", "WAITING_FOR_OPPONENT", "DISPUTED"] as const) {
      expect(canTransition("COMPLETED", to)).toBe(false);
    }
  });

  it("never resurrects a refunded duel", () => {
    for (const to of DUEL_STATUSES) expect(canTransition("REFUNDED", to)).toBe(false);
  });

  it("assertTransition throws DuelStateError on illegal edges only", () => {
    expect(() => assertTransition("ACTIVE", "VERIFYING")).not.toThrow();
    expect(() => assertTransition("COMPLETED", "ACTIVE")).toThrow(DuelStateError);
  });

  it("keeps the sweep/marketplace status sets consistent with the table", () => {
    expect([...JOINABLE_STATUSES]).toEqual(["WAITING_FOR_OPPONENT"]);
    expect([...EXPIRABLE_STATUSES]).toEqual(["CREATED", "WAITING_FOR_OPPONENT"]);
    // Every expirable status must legally reach EXPIRED.
    for (const s of EXPIRABLE_STATUSES) expect(canTransition(s, "EXPIRED")).toBe(true);
  });
});
