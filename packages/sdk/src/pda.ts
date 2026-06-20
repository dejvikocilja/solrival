import { PublicKey } from "@solana/web3.js";
import { CONFIG_SEED, ESCROW_SEED, VAULT_SEED } from "./constants";
import { uuidToBytes } from "./duel-id";

const seed = (s: string) => new TextEncoder().encode(s);
const idBytes = (duelId: string | Uint8Array) =>
  typeof duelId === "string" ? uuidToBytes(duelId) : duelId;

/** Singleton platform config: seeds = [b"config"]. */
export function deriveConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seed(CONFIG_SEED)], programId);
}

/** Duel escrow metadata account: seeds = [b"escrow", duel_id(16)]. */
export function deriveEscrowPda(
  duelId: string | Uint8Array,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seed(ESCROW_SEED), idBytes(duelId)], programId);
}

/** Lamport-only vault holding the staked SOL: seeds = [b"vault", duel_id(16)]. */
export function deriveVaultPda(
  duelId: string | Uint8Array,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seed(VAULT_SEED), idBytes(duelId)], programId);
}
