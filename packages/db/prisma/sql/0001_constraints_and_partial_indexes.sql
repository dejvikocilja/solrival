-- =============================================================================
-- SolRival — supplementary DDL Prisma cannot express in schema.prisma.
-- Apply by appending to the generated migration:
--   pnpm db:migrate -- --create-only      # generates migration.sql, not applied
--   cat prisma/sql/0001_*.sql >> prisma/migrations/<ts>_init/migration.sql
--   pnpm db:migrate                        # applies everything atomically
-- gen_random_uuid() is built into Postgres 13+ (Supabase = PG15), no extension.
-- =============================================================================

-- ---- CHECK constraints (data integrity for money / counts / self-play) ------
ALTER TABLE users
  ADD CONSTRAINT users_wins_nonneg   CHECK (wins   >= 0),
  ADD CONSTRAINT users_losses_nonneg CHECK (losses >= 0);

ALTER TABLE game_accounts
  ADD CONSTRAINT ga_trophies_nonneg CHECK (trophies IS NULL OR trophies >= 0),
  ADD CONSTRAINT ga_level_nonneg    CHECK (account_level IS NULL OR account_level >= 0),
  ADD CONSTRAINT ga_winrate_range   CHECK (win_rate_bps IS NULL OR win_rate_bps BETWEEN 0 AND 10000);

ALTER TABLE duels
  ADD CONSTRAINT duels_stake_positive CHECK (stake_lamports > 0),
  ADD CONSTRAINT duels_fee_range      CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT duels_expiry_after   CHECK (expires_at > created_at),
  ADD CONSTRAINT duels_no_self_play   CHECK (opponent_id IS NULL OR opponent_id <> creator_id),
  ADD CONSTRAINT duels_private_token  CHECK (visibility <> 'PRIVATE' OR invite_token IS NOT NULL);

ALTER TABLE escrow_transactions
  ADD CONSTRAINT escrow_amount_positive CHECK (amount_lamports > 0);

ALTER TABLE tournaments
  ADD CONSTRAINT tour_min_participants CHECK (max_participants >= 2),
  ADD CONSTRAINT tour_entry_nonneg     CHECK (entry_fee_lamports >= 0),
  ADD CONSTRAINT tour_pool_nonneg      CHECK (prize_pool_lamports >= 0);

ALTER TABLE tournament_matches
  ADD CONSTRAINT tm_round_positive  CHECK (round >= 1),
  ADD CONSTRAINT tm_pos_nonneg      CHECK (bracket_position >= 0),
  ADD CONSTRAINT tm_distinct_players CHECK (
    player_one_id IS NULL OR player_two_id IS NULL OR player_one_id <> player_two_id
  );

-- ---- Case-insensitive username uniqueness (keeps the plain @unique too) ------
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

-- ---- Partial indexes for hot, selective queries -----------------------------
-- Marketplace: only public + joinable duels, sorted by expiry ("Expiring Soon").
CREATE INDEX IF NOT EXISTS duels_marketplace_open_idx
  ON duels (expires_at)
  WHERE visibility = 'PUBLIC' AND status IN ('CREATED', 'WAITING_FOR_OPPONENT');

-- Verifier sweep: duels currently being verified.
CREATE INDEX IF NOT EXISTS duels_verifying_idx
  ON duels (verifying_at)
  WHERE status = 'VERIFYING';

-- Expiry sweep: open duels approaching the 30-min cutoff.
CREATE INDEX IF NOT EXISTS duels_expiry_sweep_idx
  ON duels (expires_at)
  WHERE status IN ('CREATED', 'WAITING_FOR_OPPONENT', 'ACCEPTED');

-- Verification queue pickup.
CREATE INDEX IF NOT EXISTS vjobs_runnable_idx
  ON verification_jobs (scheduled_at)
  WHERE status IN ('QUEUED', 'RETRYING');

-- Admin dispute queue.
CREATE INDEX IF NOT EXISTS disputes_open_idx
  ON disputes (created_at)
  WHERE status IN ('OPEN', 'UNDER_REVIEW');

-- ---- Auth challenge cleanup support -----------------------------------------
-- Sweep job deletes WHERE expires_at < now() OR consumed_at IS NOT NULL.
CREATE INDEX IF NOT EXISTS auth_challenges_sweep_idx
  ON auth_challenges (expires_at)
  WHERE consumed_at IS NULL;
