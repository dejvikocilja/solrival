import type { PublicKey } from "@solana/web3.js";

/** Matches the on-chain EscrowStatus enum (programs/solrival-escrow/state). */
export enum EscrowStatus {
  WaitingForOpponent = "waitingForOpponent",
  Funded = "funded",
  Completed = "completed",
  Refunded = "refunded",
}

/** Decoded Escrow account (shape consumers get when they fetch + decode). */
export interface EscrowAccount {
  duelId: Uint8Array; // 16 bytes
  creator: PublicKey;
  opponent: PublicKey | null;
  stakeLamports: bigint;
  feeBps: number;
  feeWallet: PublicKey;
  resultAuthority: PublicKey;
  status: EscrowStatus;
  createdTs: bigint;
  expiryTs: bigint;
  bump: number;
  vaultBump: number;
}

export interface ConfigAccount {
  admin: PublicKey;
  resultAuthority: PublicKey;
  feeWallet: PublicKey;
  feeBps: number;
  paused: boolean;
  bump: number;
}
