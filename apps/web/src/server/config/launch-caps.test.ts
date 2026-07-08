import { afterEach, describe, expect, it } from "vitest";
import {
  launchMaxStakeLamports,
  launchMaxWithdrawalPerDayLamports,
  formatSol,
} from "./launch-caps";

const SOL = 1_000_000_000n;

afterEach(() => {
  delete process.env.LAUNCH_MAX_STAKE_SOL;
  delete process.env.LAUNCH_MAX_WITHDRAWAL_SOL_PER_DAY;
});

describe("launch caps", () => {
  it("defaults to 5 SOL stake / 50 SOL daily withdrawal when unset", () => {
    expect(launchMaxStakeLamports()).toBe(5n * SOL);
    expect(launchMaxWithdrawalPerDayLamports()).toBe(50n * SOL);
  });

  it("reads whole and fractional SOL overrides without float drift", () => {
    process.env.LAUNCH_MAX_STAKE_SOL = "2";
    expect(launchMaxStakeLamports()).toBe(2n * SOL);
    process.env.LAUNCH_MAX_STAKE_SOL = "0.5";
    expect(launchMaxStakeLamports()).toBe(500_000_000n);
    process.env.LAUNCH_MAX_STAKE_SOL = "0.001";
    expect(launchMaxStakeLamports()).toBe(1_000_000n);
  });

  it("treats 0 as explicitly uncapped (devnet only)", () => {
    process.env.LAUNCH_MAX_STAKE_SOL = "0";
    expect(launchMaxStakeLamports()).toBeNull();
  });

  it("falls back to the default on garbage or negative input", () => {
    process.env.LAUNCH_MAX_STAKE_SOL = "banana";
    expect(launchMaxStakeLamports()).toBe(5n * SOL);
    process.env.LAUNCH_MAX_WITHDRAWAL_SOL_PER_DAY = "-3";
    expect(launchMaxWithdrawalPerDayLamports()).toBe(50n * SOL);
  });

  it("formats SOL amounts for error messages without trailing zeros", () => {
    expect(formatSol(5n * SOL)).toBe("5");
    expect(formatSol(500_000_000n)).toBe("0.5");
    expect(formatSol(1_234_500_000n)).toBe("1.2345");
  });
});
