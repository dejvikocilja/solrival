-- ── Case-insensitive username uniqueness ────────────────────────────────────
-- Postgres unique indexes are case-sensitive, so "Dejvi" and "dejvi" could both
-- exist (an impersonation vector). `username_lower` is the real uniqueness
-- guarantee; `username` keeps the user's chosen casing for display.
ALTER TABLE "users" ADD COLUMN "username_lower" TEXT;

-- Backfill from existing usernames. Verified before writing this migration that
-- no two existing users collide case-insensitively, so this cannot fail.
UPDATE "users" SET "username_lower" = lower("username");

ALTER TABLE "users" ALTER COLUMN "username_lower" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_lower_key" ON "users"("username_lower");

-- ── Persisted withdrawal fees ───────────────────────────────────────────────
-- The fee was previously recomputed from the CURRENT env rate whenever it was
-- needed, which silently rewrites the accounting of past withdrawals every time
-- the rate changes. Persist gross / fee / net on the row instead.
ALTER TABLE "withdrawal_requests" ADD COLUMN "fee_lamports" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "withdrawal_requests" ADD COLUMN "fee_bps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "withdrawal_requests" ADD COLUMN "net_lamports" BIGINT NOT NULL DEFAULT 0;

-- Backfill historical rows at the rate that was actually charged when they were
-- paid (200 bps / 2%). Only COMPLETED withdrawals ever had a fee taken; rows in
-- any other state were never paid out, so gross == net and fee == 0.
UPDATE "withdrawal_requests"
SET "fee_bps"      = 200,
    "fee_lamports" = ("amount_lamports" * 200) / 10000,
    "net_lamports" = "amount_lamports" - (("amount_lamports" * 200) / 10000)
WHERE "status" = 'COMPLETED';

UPDATE "withdrawal_requests"
SET "net_lamports" = "amount_lamports"
WHERE "status" <> 'COMPLETED';
