import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID } from "./constants";
import { deriveConfigPda, deriveEscrowPda, deriveVaultPda } from "./pda";
import { uuidToBytes } from "./duel-id";
import {
  acceptDuelIx,
  initializeConfigIx,
  initializeDuelIx,
  reclaimExpiredIx,
  cancelDuelIx,
  refundDuelIx,
  settleDuelIx,
  updateConfigIx,
} from "./instructions";

/**
 * Ergonomic, IDL-free client. Each method resolves PDAs and returns an unsigned
 * TransactionInstruction so the caller controls signing:
 *  - initializeDuel / acceptDuel -> signed by the player's wallet (web app)
 *  - settle / refund            -> signed by the result authority (verifier)
 *  - reclaimExpired             -> signed by the creator
 */
export class SolRivalEscrowClient {
  readonly programId: PublicKey;

  constructor(programId: PublicKey | string = DEFAULT_PROGRAM_ID) {
    this.programId = typeof programId === "string" ? new PublicKey(programId) : programId;
  }

  configPda(): PublicKey {
    return deriveConfigPda(this.programId)[0];
  }
  escrowPda(duelId: string | Uint8Array): PublicKey {
    return deriveEscrowPda(duelId, this.programId)[0];
  }
  vaultPda(duelId: string | Uint8Array): PublicKey {
    return deriveVaultPda(duelId, this.programId)[0];
  }

  initializeConfig(p: {
    admin: PublicKey;
    resultAuthority: PublicKey;
    feeWallet: PublicKey;
    feeBps: number;
  }): TransactionInstruction {
    return initializeConfigIx(this.programId, { ...p, config: this.configPda() });
  }

  updateConfig(p: {
    admin: PublicKey;
    newResultAuthority?: PublicKey | null;
    newFeeWallet?: PublicKey | null;
    newFeeBps?: number | null;
    newPaused?: boolean | null;
  }): TransactionInstruction {
    return updateConfigIx(this.programId, { ...p, config: this.configPda() });
  }

  initializeDuel(p: {
    creator: PublicKey;
    duelId: string;
    stakeLamports: bigint;
  }): TransactionInstruction {
    const id = uuidToBytes(p.duelId);
    return initializeDuelIx(this.programId, {
      creator: p.creator,
      config: this.configPda(),
      escrow: this.escrowPda(id),
      vault: this.vaultPda(id),
      duelId: id,
      stakeLamports: p.stakeLamports,
    });
  }

  acceptDuel(p: { opponent: PublicKey; duelId: string }): TransactionInstruction {
    const id = uuidToBytes(p.duelId);
    return acceptDuelIx(this.programId, {
      opponent: p.opponent,
      escrow: this.escrowPda(id),
      vault: this.vaultPda(id),
    });
  }

  settle(p: {
    duelId: string;
    resultAuthority: PublicKey;
    winner: PublicKey;
    creator: PublicKey;
    feeWallet: PublicKey;
  }): TransactionInstruction {
    const id = uuidToBytes(p.duelId);
    return settleDuelIx(this.programId, {
      escrow: this.escrowPda(id),
      vault: this.vaultPda(id),
      resultAuthority: p.resultAuthority,
      winner: p.winner,
      feeWallet: p.feeWallet,
      creator: p.creator,
    });
  }

  refund(p: {
    duelId: string;
    resultAuthority: PublicKey;
    creator: PublicKey;
    opponent: PublicKey;
  }): TransactionInstruction {
    const id = uuidToBytes(p.duelId);
    return refundDuelIx(this.programId, {
      escrow: this.escrowPda(id),
      vault: this.vaultPda(id),
      resultAuthority: p.resultAuthority,
      creator: p.creator,
      opponent: p.opponent,
    });
  }

  /** Creator cancels their own unaccepted, funded duel (immediate refund). */
  cancelDuel(p: { duelId: string; creator: PublicKey }): TransactionInstruction {
    const id = uuidToBytes(p.duelId);
    return cancelDuelIx(this.programId, {
      escrow: this.escrowPda(id),
      creator: p.creator,
      vault: this.vaultPda(id),
    });
  }

  /** Permissionless reclaim of an expired duel; funds go to the recorded creator. */
  reclaimExpired(p: { duelId: string; creator: PublicKey; caller: PublicKey }): TransactionInstruction {
    const id = uuidToBytes(p.duelId);
    return reclaimExpiredIx(this.programId, {
      escrow: this.escrowPda(id),
      creator: p.creator,
      vault: this.vaultPda(id),
      caller: p.caller,
    });
  }
}
