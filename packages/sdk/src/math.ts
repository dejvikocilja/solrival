import { BPS_DENOMINATOR } from "./constants";

export interface Settlement {
  pot: bigint;     // total prize pool (2 x stake)
  fee: bigint;     // platform fee (floored)
  payout: bigint;  // winner payout (pot - fee)
}

/**
 * Deterministic settlement math — MUST match the on-chain program exactly:
 * pot = 2*stake, fee = floor(pot*feeBps/10000), payout = pot - fee.
 * No lamports are lost: payout + fee === pot.
 */
export function computeSettlement(stakeLamports: bigint, feeBps: number): Settlement {
  if (stakeLamports <= 0n) throw new Error("stake must be positive");
  if (feeBps < 0 || feeBps > 10_000) throw new Error("feeBps out of range");
  const pot = stakeLamports * 2n;
  const fee = (pot * BigInt(feeBps)) / BPS_DENOMINATOR;
  const payout = pot - fee;
  return { pot, fee, payout };
}
