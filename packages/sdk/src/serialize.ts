import { PublicKey } from "@solana/web3.js";

/** Borsh-compatible little-endian primitives + Option encodings for ix args. */
export function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function u16le(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

export function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

export function boolByte(v: boolean): Uint8Array {
  return new Uint8Array([v ? 1 : 0]);
}

export function pubkeyBytes(p: PublicKey): Uint8Array {
  return p.toBytes();
}

export function optionPubkey(p?: PublicKey | null): Uint8Array {
  return p ? concatBytes(new Uint8Array([1]), p.toBytes()) : new Uint8Array([0]);
}

export function optionU16(n?: number | null): Uint8Array {
  return n == null ? new Uint8Array([0]) : concatBytes(new Uint8Array([1]), u16le(n));
}

export function optionBool(v?: boolean | null): Uint8Array {
  return v == null ? new Uint8Array([0]) : concatBytes(new Uint8Array([1]), boolByte(v));
}
