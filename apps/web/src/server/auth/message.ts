import { AUTH_MESSAGE_VERSION, SOLANA_CHAIN_DEVNET, SOLANA_CHAIN_MAINNET } from "@solrival/shared";
import { authConfig } from "./config";

/**
 * Builds the human-readable Sign-In With Solana message. The server stores this
 * exact string and verifies the signature against it — the client never gets to
 * choose the signed bytes.
 */
export function buildSiwsMessage(params: {
  walletAddress: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  const chain = authConfig.cluster === "mainnet-beta" ? SOLANA_CHAIN_MAINNET : SOLANA_CHAIN_DEVNET;
  return [
    `${authConfig.domain} wants you to sign in with your Solana account:`,
    params.walletAddress,
    "",
    "Sign in to SolRival. This request will not trigger a blockchain transaction or cost any fees.",
    "",
    `URI: ${authConfig.appUrl}`,
    `Version: ${AUTH_MESSAGE_VERSION}`,
    `Chain ID: ${chain}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt.toISOString()}`,
    `Expiration Time: ${params.expiresAt.toISOString()}`,
  ].join("\n");
}
