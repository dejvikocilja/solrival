-- ── Case-insensitive username uniqueness ────────────────────────────────────
-- The initial migration created an EXPRESSION index of the same name on
-- lower(username). We replace it with a real `username_lower` column (which the
-- Prisma schema and the app write on every username change), reusing the index
-- name Prisma expects. Drop first so the name is free.
DROP INDEX IF EXISTS "users_username_lower_key";

ALTER TABLE "users" ADD COLUMN "username_lower" TEXT;

-- Backfill from existing usernames.
UPDATE "users" SET "username_lower" = lower("username");

ALTER TABLE "users" ALTER COLUMN "username_lower" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_lower_key" ON "users"("username_lower");

-- ── Persisted withdrawal fees ───────────────────────────────────────────────
-- The fee was previously recomputed from the CURRENT env rate whenever needed,
-- which silently rewrites the accounting of past withdrawals every time the
-- rate changes. Persist gross / fee / net on the row instead.
ALTER TABLE "withdrawal_requests" ADD COLUMN "fee_lamports" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "withdrawal_requests" ADD COLUMN "fee_bps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "withdrawal_requests" ADD COLUMN "net_lamports" BIGINT NOT NULL DEFAULT 0;

-- Backfill historical rows at the rate actually charged when they were paid
-- (200 bps / 2%). Only COMPLETED withdrawals ever had a fee taken; rows in any
-- other state were never paid out, so gross == net and fee == 0.
UPDATE "withdrawal_requests"
SET "fee_bps"      = 200,
    "fee_lamports" = ("amount_lamports" * 200) / 10000,
    "net_lamports" = "amount_lamports" - (("amount_lamports" * 200) / 10000)
WHERE "status" = 'COMPLETED';

UPDATE "withdrawal_requests"
SET "net_lamports" = "amount_lamports"
WHERE "status" <> 'COMPLETED';
