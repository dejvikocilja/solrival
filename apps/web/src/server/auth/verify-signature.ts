import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Verifies an ed25519 signature produced by any Solana wallet (Phantom,
 * Solflare, Backpack — identical at this layer) over the given message.
 *
 * @returns true only if the signature is valid for the message + pubkey.
 */
export function verifySolanaSignature(params: {
  message: string;
  signatureBase58: string;
  walletAddress: string;
}): boolean {
  try {
    const messageBytes = new TextEncoder().encode(params.message);
    const signatureBytes = bs58.decode(params.signatureBase58);
    const publicKeyBytes = bs58.decode(params.walletAddress);

    if (signatureBytes.length !== 64 || publicKeyBytes.length !== 32) return false;

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    // Malformed base58 / wrong lengths -> treat as invalid, never throw to caller.
    return false;
  }
}
