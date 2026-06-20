import { PublicKey } from "@solana/web3.js";
import { accountDiscriminator } from "./discriminator";
import { EscrowStatus, type ConfigAccount, type EscrowAccount } from "./types";

/**
 * Minimal Borsh readers for the program's Anchor accounts. Layout mirrors the
 * Rust structs exactly (8-byte discriminator + fields in declaration order).
 * Used by the backend to verify on-chain state during deposit/accept/cancel
 * confirmation — i.e. never trust the client about what happened on-chain.
 */
class Reader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  private view() {
    return new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
  }
  skip(n: number) {
    this.o += n;
  }
  u8(): number {
    return this.b[this.o++]!;
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  u16(): number {
    const v = this.view().getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  u64(): bigint {
    const v = this.view().getBigUint64(this.o, true);
    this.o += 8;
    return v;
  }
  i64(): bigint {
    const v = this.view().getBigInt64(this.o, true);
    this.o += 8;
    return v;
  }
  bytes(n: number): Uint8Array {
    const slice = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return slice;
  }
  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }
  optionPubkey(): PublicKey | null {
    return this.u8() === 1 ? this.pubkey() : null;
  }
}

function assertDiscriminator(data: Uint8Array, name: string): void {
  const expected = accountDiscriminator(name);
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) throw new Error(`Not a ${name} account (discriminator mismatch)`);
  }
}

const STATUS_BY_INDEX: EscrowStatus[] = [
  EscrowStatus.WaitingForOpponent,
  EscrowStatus.Funded,
  EscrowStatus.Completed,
  EscrowStatus.Refunded,
];

export function decodeEscrow(data: Uint8Array): EscrowAccount {
  assertDiscriminator(data, "Escrow");
  const r = new Reader(data);
  r.skip(8); // discriminator
  return {
    duelId: r.bytes(16),
    creator: r.pubkey(),
    opponent: r.optionPubkey(),
    stakeLamports: r.u64(),
    feeBps: r.u16(),
    feeWallet: r.pubkey(),
    resultAuthority: r.pubkey(),
    status: STATUS_BY_INDEX[r.u8()] ?? EscrowStatus.WaitingForOpponent,
    createdTs: r.i64(),
    expiryTs: r.i64(),
    bump: r.u8(),
    vaultBump: r.u8(),
  };
}

export function decodeConfig(data: Uint8Array): ConfigAccount {
  assertDiscriminator(data, "Config");
  const r = new Reader(data);
  r.skip(8);
  return {
    admin: r.pubkey(),
    resultAuthority: r.pubkey(),
    feeWallet: r.pubkey(),
    feeBps: r.u16(),
    paused: r.bool(),
    bump: r.u8(),
  };
}
