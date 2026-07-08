import { describe, it, expect } from "vitest";
import { duelEconomics, BPS_DENOMINATOR } from "./economics";

const SOL = 1_000_000_000n;

describe("duelEconomics", () => {
  it("computes the documented 10% rake case exactly", () => {
    // 1 SOL stake each, 10% rake: pot 2 SOL, rake 0.2 SOL, reward 1.8 SOL,
    // winner profit 0.8 SOL — the numbers every UI breakdown shows.
    const e = duelEconomics(1n * SOL, 1_000);
    expect(e.pot).toBe(2n * SOL);
    expect(e.rake).toBe(200_000_000n);
    expect(e.reward).toBe(1_800_000_000n);
    expect(e.netWinnings).toBe(800_000_000n);
  });

  it("conserves the pot: reward + rake === pot, for many stakes and fees", () => {
    const stakes = [1n, 3n, 999n, 10_000_001n, 123_456_789n, 5n * SOL, 1_000n * SOL];
    const fees = [0, 1, 250, 1_000, 2_500, 9_999, 10_000];
    for (const stake of stakes) {
      for (const feeBps of fees) {
        const e = duelEconomics(stake, feeBps);
        expect(e.reward + e.rake).toBe(e.pot);
        expect(e.pot).toBe(stake * 2n);
      }
    }
  });

  it("splits the loser's stake exactly between winner profit and rake", () => {
    // netWinnings + rake === stake — the identity the dispute-reversal ledger
    // entries rely on (void: winner returns netWinnings, loser gets stake,
    // platform gives up rake; the three must reconcile to zero).
    for (const stake of [1n, 7n, 33_333_333n, 2n * SOL]) {
      for (const feeBps of [0, 200, 1_000, 5_000, 10_000]) {
        const e = duelEconomics(stake, feeBps);
        expect(e.netWinnings + e.rake).toBe(e.stake);
      }
    }
  });

  it("floors the rake (never rounds in the platform's favour past the floor)", () => {
    // stake 3 lamports, 33.33% fee: pot 6, exact rake 1.9998 → floor 1.
    const e = duelEconomics(3n, 3_333);
    expect(e.rake).toBe((6n * 3_333n) / BPS_DENOMINATOR);
    expect(e.rake).toBe(1n);
    expect(e.reward).toBe(5n);
  });

  it("handles the edges: zero fee, full fee, zero stake", () => {
    const zeroFee = duelEconomics(SOL, 0);
    expect(zeroFee.rake).toBe(0n);
    expect(zeroFee.reward).toBe(2n * SOL);

    const fullFee = duelEconomics(SOL, 10_000);
    expect(fullFee.rake).toBe(2n * SOL);
    expect(fullFee.reward).toBe(0n);

    const zeroStake = duelEconomics(0n, 1_000);
    expect(zeroStake.pot).toBe(0n);
    expect(zeroStake.reward).toBe(0n);
  });

  it("rejects invalid input", () => {
    expect(() => duelEconomics(-1n, 1_000)).toThrow(RangeError);
    expect(() => duelEconomics(SOL, -1)).toThrow(RangeError);
    expect(() => duelEconomics(SOL, 10_001)).toThrow(RangeError);
    expect(() => duelEconomics(SOL, 12.5)).toThrow(RangeError);
  });
});
