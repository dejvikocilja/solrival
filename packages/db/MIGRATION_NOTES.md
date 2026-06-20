# SolRival — Database Migration Notes

## 1. Prerequisites

- **Postgres 13+** (Supabase = PG15). `gen_random_uuid()` is built into core — **no extension needed** for UUID defaults.
- Two connection strings in env (already in `.env.example`):
  - `DATABASE_URL` — pooled (pgbouncer, `connection_limit=1`) for app runtime.
  - `DIRECT_URL` — direct connection; Prisma uses this for migrations (migrations can't run over a transaction pooler).

## 2. Generating the initial migration

CHECK constraints and partial indexes **cannot** be expressed in `schema.prisma`. The flow folds the raw SQL into the same migration so everything applies atomically:

```bash
pnpm db:generate                         # prisma client
pnpm --filter @solrival/db migrate:dev -- --name init --create-only
#   ^ writes prisma/migrations/<ts>_init/migration.sql but does NOT apply it

cat packages/db/prisma/sql/0001_constraints_and_partial_indexes.sql \
  >> packages/db/prisma/migrations/<ts>_init/migration.sql

pnpm --filter @solrival/db migrate:dev   # applies the combined migration
pnpm --filter @solrival/db seed          # seeds the 7 duel_rules templates
```

Production deploy: `prisma migrate deploy` (idempotent, applies committed migrations only).

## 3. Key modeling decisions

- **Money = `BigInt` lamports.** Never floats/Decimal for currency. 1 SOL = 1e9 lamports; PG `int8` max (~9.2e18) dwarfs total SOL supply. Snapshots (`stake_lamports`, `platform_fee_bps`, and at settlement `winner_payout_lamports`, `fee_collected_lamports`) freeze the numbers shown in the duel modal so UI and on-chain settlement always agree even if global fee config changes later.
- **`duel_rules` is a registry, not per-duel rows.** Duels FK to it, so only predefined, verifier-supported templates can ever be used (spec: "no custom modes"). Seed it before creating duels.
- **`escrow_seed` (unique) binds funds to a duel** for PDA derivation; `escrow_pda` stores the derived address. Both unique → one escrow per duel.
- **Idempotency:** `verification_jobs.duel_id` is unique (one verification record per duel; retries bump `attempts`). `escrow_transactions.signature` and `idempotency_key` are unique → settlement cannot be double-recorded. These mirror the on-chain terminal-state guarantee.
- **Lifecycle timestamps** (`accepted_at`, `escrow_funded_at`, `activated_at`, `verifying_at`, `settled_at`) make the spec's duel timeline exact and auditable rather than inferred.
- **Audit:** every table has `created_at`/`updated_at` except `admin_audit_log`, which is **append-only** (`created_at` only; rows are immutable).

## 4. Referential actions

- Financial / identity edges use **`onDelete: Restrict`** (users, duels, escrow, verification, audit admin) — financial history is never cascade-deleted.
- Optional descriptive links use **`SetNull`** (opponent, winner, game-account refs, bracket `nextMatch`).
- Only `tournament_players` / `tournament_matches` **`Cascade`** from their tournament, so a draft/cancelled tournament can be torn down cleanly. Hard-deleting users/duels is intentionally blocked; suspend users via `users.suspended` instead.

## 5. Constraints enforced in SQL (see `prisma/sql/0001_*.sql`)

Positive stakes, fee bps in 0–10000, `expires_at > created_at`, `opponent_id <> creator_id`, private duels require an `invite_token`, tournaments need ≥2 participants, bracket players must differ, and a case-insensitive unique username index (`lower(username)`).

## 6. Supabase specifics

- App reads/writes go through Prisma over the **direct/service connection** (bypasses RLS). Do **not** expose write paths via the anon client.
- Supabase **Realtime** (winners feed, marketplace, timeline) reads should be served through **RLS-protected views/policies** exposing only non-sensitive columns — never full wallet addresses or treasury data (spec: hide balances/revenue).
- **`BigInt` serialization:** lamport values must be stringified at the API boundary (JSON has no BigInt). Centralize this in the API serializer.

## 7. Enum evolution

Adding enum values is online in PG, but Prisma wraps it in a migration — `ALTER TYPE ... ADD VALUE` **cannot run inside a transaction block**. When introducing new statuses/templates later, mark that migration to run outside a transaction (or split it) to avoid migrate failures.

## 8. Credits / custody migration (balance ledger)

This migration moves the platform to a **custodial credits** model: users deposit SOL to a single platform treasury, balances live in `user_balances`, duels debit/credit credits, and withdrawals send SOL back out. It adds `user_balances`, `ledger_entries`, `deposits`, `withdrawal_requests`, `referrals`, the supporting enums, and `duels.funding_mode` (default `CREDITS`). Generate it the same create-only way as `init`, then fold in the raw SQL:

```bash
pnpm --filter @solrival/db migrate:dev -- --name credits --create-only
cat packages/db/prisma/sql/0002_credits_constraints.sql \
  >> packages/db/prisma/migrations/<ts>_credits/migration.sql
pnpm --filter @solrival/db migrate:dev
```

Key points:

- **`users.referral_code` is `NOT NULL UNIQUE`.** On an empty pre-launch DB this is fine. If applying against existing users, backfill first inside the migration before the `NOT NULL` is enforced, e.g. `UPDATE users SET referral_code = encode(gen_random_bytes(5),'hex') WHERE referral_code IS NULL;` (add the column nullable, backfill, then set NOT NULL).
- **The ledger is the source of truth, the balance is a fast cache.** Every `user_balances` mutation is written in the *same transaction* as a `ledger_entries` row carrying the signed `delta_available` / `delta_locked` and the post-mutation snapshot. `ledger_entries.idempotency_key` is unique so each economic event (a specific deposit, a specific duel settlement, a specific withdrawal) applies exactly once under retries. Reconcile by replaying the ledger: `SUM(delta_available)` per user must equal `available_lamports`.
- **Non-negativity is enforced in SQL** (`balance_available_nonneg`, `balance_locked_nonneg`). Combined with guarded conditional updates (`WHERE available_lamports >= :amount`) this makes overdraft impossible even under concurrency — the same race-safe pattern the duel state machine uses.
- **Money conservation on deposits** is a CHECK (`credited = gross - fee`); the fee is platform revenue (summable from `deposits.fee_lamports`). Duels charge **no** fee under the new model — the winner receives the entire pot.
- **Treasury custody:** the treasury keypair signs withdrawal payouts off-chain in the verifier/keeper context (`TREASURY_SECRET_KEY`), never in the browser. Deposits are *verified* against the chain (finalized, recipient = treasury, sender = the user's linked wallet) before crediting; the signature's uniqueness prevents double-credit.
- **Referrals** are 1-per-referee (`referee_id` unique) and fire once, on the referee's first credited deposit.

## 9. Tournament settlement migration (ledger-backed prizes)

Wiring tournaments onto the credits ledger adds, to `schema.prisma`:

- Four `LedgerEntryType` values — `TOURNAMENT_ENTRY_LOCK`, `TOURNAMENT_ENTRY_REFUND`, `TOURNAMENT_ENTRY_FORFEIT`, `TOURNAMENT_PRIZE`.
- `ledger_entries.tournament_id` (nullable FK → `tournaments`, `onDelete: SetNull`) plus its index, and the reciprocal `Tournament.ledgerEntries` relation.

Generate it create-only and apply (no raw SQL needed — all changes are Prisma-expressible):

```bash
pnpm --filter @solrival/db migrate:dev -- --name tournaments_ledger --create-only
pnpm --filter @solrival/db migrate:dev
pnpm db:generate   # regenerate the client so the new enum values + field type-check
```

Because this adds enum values, heed section 7: `ALTER TYPE … ADD VALUE` cannot run inside a transaction. Prisma normally splits this correctly; if `migrate:dev` complains, move the `ALTER TYPE` statements to the top of the generated `migration.sql` so they run before the column/index changes.

Economic model (mirrors duels): registration LOCKs the entry fee (available → locked) and grows `prize_pool_lamports`; completion FORFEITs every locked fee and pays placements per `prize_distribution` as `TOURNAMENT_PRIZE` credits; cancellation REFUNDs every locked fee. Conservation holds: `prize_pool == Σ entry fees`, and forfeits out of `locked` exactly fund the prizes into `available`.
