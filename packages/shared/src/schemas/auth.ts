import { z } from "zod";

/**
 * Cross-cutting auth contracts shared by web client + server.
 * Wallet provider is recorded but does NOT change verification: Phantom,
 * Solflare, and Backpack all produce ed25519 signatures verified identically.
 */

export const WALLET_PROVIDERS = ["PHANTOM", "SOLFLARE", "BACKPACK"] as const;
export const walletProviderSchema = z.enum(WALLET_PROVIDERS);
export type WalletProvider = z.infer<typeof walletProviderSchema>;

// base58, no 0/O/I/l. A Solana pubkey is 32 bytes -> 32–44 base58 chars.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
export const base58PubkeySchema = z
  .string()
  .min(32)
  .max(44)
  .regex(BASE58, "Invalid base58 public key");

export const base58SignatureSchema = z
  .string()
  .min(64)
  .max(128)
  .regex(BASE58, "Invalid base58 signature");

// ---- POST /api/auth/nonce ---------------------------------------------------
export const nonceRequestSchema = z.object({
  walletAddress: base58PubkeySchema,
  provider: walletProviderSchema,
});
export type NonceRequest = z.infer<typeof nonceRequestSchema>;

export const nonceResponseSchema = z.object({
  nonce: z.string(),
  message: z.string(), // exact text the wallet must sign
  expiresAt: z.string().datetime(),
});
export type NonceResponse = z.infer<typeof nonceResponseSchema>;

// ---- POST /api/auth/verify --------------------------------------------------
export const verifyRequestSchema = z.object({
  walletAddress: base58PubkeySchema,
  provider: walletProviderSchema,
  nonce: z.string().min(16),
  signature: base58SignatureSchema,
});
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

// ---- Session user (safe public shape) --------------------------------------
export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  walletAddress: z.string(),
  username: z.string(),
  role: z.enum(["PLAYER", "ADMIN"]),
  provider: walletProviderSchema.nullable(),
  wins: z.number().int(),
  losses: z.number().int(),
  suspended: z.boolean(),
  createdAt: z.string().datetime(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const verifyResponseSchema = z.object({ user: sessionUserSchema });
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

// ---- PATCH /api/users/me ----------------------------------------------------
/**
 * Names nobody may claim: they'd let a user impersonate the platform, staff, or
 * a system surface. Checked case-insensitively (and the DB enforces
 * case-insensitive uniqueness, so "Admin" can't sneak past "admin").
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin", "administrator", "root", "system", "support", "help", "moderator", "mod",
  "staff", "team", "official", "solrival", "sol-rival", "solrival_team", "treasury",
  "wallet", "security", "billing", "payments", "api", "www", "null", "undefined",
  "anonymous", "deleted", "everyone", "here", "me", "you",
]);

/**
 * Username rules (standard practice for a public competitive platform):
 *  - 3–20 characters, letters/numbers/hyphen/underscore only
 *  - must start with a letter or number (no leading -/_ used to fake sorting)
 *  - no trailing separator, no consecutive separators ("a__b", "a--b")
 *  - not a reserved word
 * Uniqueness is case-insensitive and enforced by the database.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, hyphen or underscore only")
  .regex(/^[a-zA-Z0-9]/, "Username must start with a letter or number")
  .regex(/[a-zA-Z0-9]$/, "Username must end with a letter or number")
  .refine((v) => !/[-_]{2,}/.test(v), "No consecutive hyphens or underscores")
  .refine((v) => !RESERVED_USERNAMES.has(v.toLowerCase()), "That username is reserved");

export const updateProfileSchema = z.object({ username: usernameSchema });
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
