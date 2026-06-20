-- =============================================================================
-- SolRival — credits/custody supplementary DDL (balance ledger, deposits,
-- withdrawals, referrals). Money invariants + hot partial indexes that Prisma
-- cannot express in schema.prisma.
-- Apply by appending to the credits migration:
--   pnpm db:migrate -- --name credits --create-only
--   cat prisma/sql/0002_credits_constraints.sql >> prisma/migrations/<ts>_credits/migration.sql
--   pnpm db:migrate
-- =============================================================================

-- ---- Balance invariants -----------------------------------------------------
-- The custodial guarantee: a user can never owe the platform. Both buckets are
-- non-negative at all times; spend math relies on this never being violated.
ALTER TABLE user_balances
  ADD CONSTRAINT balance_available_nonneg CHECK (available_lamports >= 0),
  ADD CONSTRAINT balance_locked_nonneg    CHECK (locked_lamports    >= 0),
  ADD CONSTRAINT balance_lifetime_nonneg  CHECK (
    lifetime_deposited_lamports >= 0 AND
    lifetime_withdrawn_lamports >= 0 AND
    lifetime_won_lamports       >= 0
  );

-- ---- Ledger entry sanity (snapshots are non-negative) -----------------------
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_snapshot_nonneg CHECK (available_after >= 0 AND locked_after >= 0);

-- ---- Deposit money math -----------------------------------------------------
-- credited = gross - fee, with every component non-negative. Guarantees the fee
-- split can never mint or destroy lamports.
ALTER TABLE deposits
  ADD CONSTRAINT deposit_amounts_nonneg CHECK (
    gross_lamports >= 0 AND fee_lamports >= 0 AND credited_lamports >= 0
  ),
  ADD CONSTRAINT deposit_fee_split CHECK (credited_lamports = gross_lamports - fee_lamports),
  ADD CONSTRAINT deposit_fee_bps_range CHECK (fee_bps BETWEEN 0 AND 10000);

-- ---- Withdrawal money math --------------------------------------------------
ALTER TABLE withdrawal_requests
  ADD CONSTRAINT withdrawal_amount_positive CHECK (amount_lamports > 0);

-- ---- Referral reward math ---------------------------------------------------
ALTER TABLE referrals
  ADD CONSTRAINT referral_reward_nonneg  CHECK (reward_lamports >= 0),
  ADD CONSTRAINT referral_bps_range      CHECK (reward_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT referral_no_self        CHECK (referrer_id <> referee_id);

-- ---- Partial indexes for hot, selective queues ------------------------------
-- Admin withdrawal review queue: only the rows an admin must act on.
CREATE INDEX IF NOT EXISTS withdrawals_review_idx
  ON withdrawal_requests (created_at)
  WHERE status = 'PENDING_REVIEW';

-- Treasury payout worker: approved requests awaiting an on-chain transfer.
CREATE INDEX IF NOT EXISTS withdrawals_payout_idx
  ON withdrawal_requests (created_at)
  WHERE status IN ('APPROVED', 'FAILED');

-- Deposit crediting worker: detected-but-not-yet-credited transfers.
CREATE INDEX IF NOT EXISTS deposits_pending_idx
  ON deposits (created_at)
  WHERE status IN ('DETECTED', 'CONFIRMED');

-- Referral payout worker: rewards earned but not yet credited.
CREATE INDEX IF NOT EXISTS referrals_pending_idx
  ON referrals (created_at)
  WHERE status = 'PENDING';
