import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { instructionDiscriminator } from "./discriminator";
import {
  concatBytes,
  optionBool,
  optionPubkey,
  optionU16,
  pubkeyBytes,
  u16le,
  u64le,
} from "./serialize";

/**
 * Self-contained instruction builders. Account order and signer/writable flags
 * mirror the Anchor account structs exactly — do not reorder. These do NOT
 * require a runtime IDL, so the SDK works the moment the program is deployed.
 */

const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta => ({
  pubkey,
  isSigner,
  isWritable,
});

const SYS = SystemProgram.programId;

function build(
  programId: PublicKey,
  keys: AccountMeta[],
  ixName: string,
  args: Uint8Array = new Uint8Array(0),
): TransactionInstruction {
  const data = Buffer.from(concatBytes(instructionDiscriminator(ixName), args));
  return new TransactionInstruction({ programId, keys, data });
}

export function initializeConfigIx(
  programId: PublicKey,
  a: { admin: PublicKey; config: PublicKey; resultAuthority: PublicKey; feeWallet: PublicKey; feeBps: number },
): TransactionInstruction {
  return build(
    programId,
    [meta(a.admin, true, true), meta(a.config, false, true), meta(SYS, false, false)],
    "initialize_config",
    concatBytes(pubkeyBytes(a.resultAuthority), pubkeyBytes(a.feeWallet), u16le(a.feeBps)),
  );
}

export function updateConfigIx(
  programId: PublicKey,
  a: {
    admin: PublicKey;
    config: PublicKey;
    newResultAuthority?: PublicKey | null;
    newFeeWallet?: PublicKey | null;
    newFeeBps?: number | null;
    newPaused?: boolean | null;
  },
): TransactionInstruction {
  return build(
    programId,
    [meta(a.admin, true, false), meta(a.config, false, true)],
    "update_config",
    concatBytes(
      optionPubkey(a.newResultAuthority),
      optionPubkey(a.newFeeWallet),
      optionU16(a.newFeeBps),
      optionBool(a.newPaused),
    ),
  );
}

export function initializeDuelIx(
  programId: PublicKey,
  a: {
    creator: PublicKey;
    config: PublicKey;
    escrow: PublicKey;
    vault: PublicKey;
    duelId: Uint8Array; // 16 bytes
    stakeLamports: bigint;
  },
): TransactionInstruction {
  if (a.duelId.length !== 16) throw new Error("duelId must be 16 bytes");
  return build(
    programId,
    [
      meta(a.creator, true, true),
      meta(a.config, false, false),
      meta(a.escrow, false, true),
      meta(a.vault, false, true),
      meta(SYS, false, false),
    ],
    "initialize_duel",
    concatBytes(a.duelId, u64le(a.stakeLamports)),
  );
}

export function acceptDuelIx(
  programId: PublicKey,
  a: { opponent: PublicKey; escrow: PublicKey; vault: PublicKey },
): TransactionInstruction {
  return build(
    programId,
    [meta(a.opponent, true, true), meta(a.escrow, false, true), meta(a.vault, false, true), meta(SYS, false, false)],
    "accept_duel",
  );
}

export function settleDuelIx(
  programId: PublicKey,
  a: {
    escrow: PublicKey;
    vault: PublicKey;
    resultAuthority: PublicKey;
    winner: PublicKey; // must equal creator or opponent (enforced on-chain)
    feeWallet: PublicKey;
    creator: PublicKey;
  },
): TransactionInstruction {
  return build(
    programId,
    [
      meta(a.escrow, false, true),
      meta(a.vault, false, true),
      meta(a.resultAuthority, true, false),
      meta(a.winner, false, true),
      meta(a.feeWallet, false, true),
      meta(a.creator, false, true),
      meta(SYS, false, false),
    ],
    "settle_duel",
  );
}

export function refundDuelIx(
  programId: PublicKey,
  a: {
    escrow: PublicKey;
    vault: PublicKey;
    resultAuthority: PublicKey;
    creator: PublicKey;
    opponent: PublicKey;
  },
): TransactionInstruction {
  return build(
    programId,
    [
      meta(a.escrow, false, true),
      meta(a.vault, false, true),
      meta(a.resultAuthority, true, false),
      meta(a.creator, false, true),
      meta(a.opponent, false, true),
      meta(SYS, false, false),
    ],
    "refund_duel",
  );
}

export function cancelDuelIx(
  programId: PublicKey,
  a: { escrow: PublicKey; creator: PublicKey; vault: PublicKey },
): TransactionInstruction {
  return build(
    programId,
    [
      meta(a.escrow, false, true),
      meta(a.creator, true, true),
      meta(a.vault, false, true),
      meta(SYS, false, false),
    ],
    "cancel_duel",
  );
}

export function reclaimExpiredIx(
  programId: PublicKey,
  a: { escrow: PublicKey; creator: PublicKey; vault: PublicKey; caller: PublicKey },
): TransactionInstruction {
  return build(
    programId,
    [
      meta(a.escrow, false, true),
      meta(a.creator, false, true), // destination only, pinned on-chain to escrow.creator
      meta(a.vault, false, true),
      meta(a.caller, true, false), // any signer / fee payer
      meta(SYS, false, false),
    ],
    "reclaim_expired",
  );
}
