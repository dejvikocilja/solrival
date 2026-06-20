/** Protocol-level constants shared by client + server. */
export const AUTH_MESSAGE_VERSION = "1";
export const SOLANA_CHAIN_MAINNET = "solana:mainnet";
export const SOLANA_CHAIN_DEVNET = "solana:devnet";

/** Lifetimes (seconds). Cookie/session names live in the web app config. */
export const NONCE_TTL_SECONDS = 5 * 60; // 5 minutes to sign
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
