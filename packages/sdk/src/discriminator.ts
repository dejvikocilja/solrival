import { sha256 } from "@noble/hashes/sha256";

/**
 * Anchor's 8-byte discriminators. Stable, documented algorithm:
 *   instruction: sha256("global:<snake_case_name>")[0..8]
 *   account:     sha256("account:<StructName>")[0..8]
 * Computing them here lets the SDK build instructions without a runtime IDL.
 */
export function instructionDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`global:${name}`)).subarray(0, 8);
}

export function accountDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`account:${name}`)).subarray(0, 8);
}
