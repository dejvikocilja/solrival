# Authentication — Sign-In With Solana (SIWS)

Wallet-based auth for Phantom / Solflare / Backpack. All three are standard
Solana wallets producing ed25519 signatures, so server verification is a single
unified path; the wallet choice is recorded on the user (`walletProvider`) but
does not change verification.

## Flow
1. `POST /api/auth/nonce` — server issues a single-use challenge and the exact
   message to sign (stored in `auth_challenges`).
2. Wallet signs the message (`signMessage`).
3. `POST /api/auth/verify` — server atomically consumes the challenge, verifies
   the ed25519 signature over the *stored* message, find-or-creates the user,
   and sets an httpOnly session cookie.
4. `GET /api/auth/session` — current user or `{ user: null }`.
5. `POST /api/auth/logout` — clears the cookie.
6. `GET|PATCH /api/users/me` — read / update profile (username).

## Security properties
- **Replay-safe:** nonces are single-use via a conditional `updateMany`
  (race-safe); expired/used challenges are rejected and swept.
- **Server owns the signed bytes:** the signature is verified against the
  message the server stored, never a client-supplied string.
- **Stateless sessions, immediate revocation:** JWT (HS256, jose) in an
  httpOnly/SameSite=Lax/secure cookie. `requireUser()` re-loads the user and
  rejects `suspended` accounts, so suspension takes effect on the next request.
- **Edge/Node split:** middleware verifies the JWT only (no DB) and gates
  `/admin`; route handlers re-check role/suspension against the DB.
- **CSRF defense-in-depth:** SameSite=Lax + same-origin check on mutations.
- **Rate limited:** nonce/verify endpoints (in-memory default — back with Redis
  in production; see `guards/rate-limit.ts`).

## Wiring TODO (next)
- Wrap the app root with `SolanaWalletProvider` (lib/solana/wallet-provider.tsx).
- Schedule an `auth_challenges` cleanup job in apps/verifier.
- Run the migration that adds the `auth_challenges` table.
