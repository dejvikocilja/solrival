-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WalletProvider" AS ENUM ('PHANTOM', 'SOLFLARE', 'BACKPACK');

-- CreateEnum
CREATE TYPE "Game" AS ENUM ('CLASH_ROYALE', 'BRAWL_STARS');

-- CreateEnum
CREATE TYPE "RuleTemplate" AS ENUM ('CR_TRIPLE_DRAFT', 'CR_DRAFT', 'CR_CLASSIC_DECK', 'CR_SUDDEN_DEATH', 'BS_KNOCKOUT', 'BS_BRAWL_BALL', 'BS_GEM_GRAB');

-- CreateEnum
CREATE TYPE "DuelVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DuelStatus" AS ENUM ('CREATED', 'WAITING_FOR_OPPONENT', 'ACCEPTED', 'ACTIVE', 'VERIFYING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'DISPUTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EscrowTxType" AS ENUM ('DEPOSIT_CREATOR', 'DEPOSIT_OPPONENT', 'PAYOUT_WINNER', 'PAYOUT_FEE', 'REFUND_CREATOR', 'REFUND_OPPONENT');

-- CreateEnum
CREATE TYPE "EscrowTxStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VERIFIED_WINNER', 'VERIFICATION_FAILURE', 'DISPUTE');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentPlayerStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'ELIMINATED', 'WINNER', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'READY', 'ACTIVE', 'VERIFYING', 'COMPLETED', 'BYE', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED_CREATOR_WIN', 'RESOLVED_OPPONENT_WIN', 'RESOLVED_REFUND', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('TOURNAMENT_CREATED', 'TOURNAMENT_UPDATED', 'TOURNAMENT_CANCELLED', 'BRACKET_GENERATED', 'PRIZE_POOL_ADJUSTED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'DUEL_FORCE_REFUNDED', 'VERIFICATION_OVERRIDDEN', 'USER_ROLE_CHANGED', 'USER_SUSPENDED', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'BALANCE_ADJUSTED');

-- CreateEnum
CREATE TYPE "DuelFundingMode" AS ENUM ('CREDITS', 'ONCHAIN_ESCROW');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEPOSIT_CREDIT', 'STAKE_LOCK', 'STAKE_REFUND', 'STAKE_FORFEIT', 'DUEL_PAYOUT', 'WITHDRAWAL_LOCK', 'WITHDRAWAL_SETTLE', 'WITHDRAWAL_REVERT', 'REFERRAL_REWARD', 'ADMIN_ADJUSTMENT', 'TOURNAMENT_ENTRY_LOCK', 'TOURNAMENT_ENTRY_REFUND', 'TOURNAMENT_ENTRY_FORFEIT', 'TOURNAMENT_PRIZE');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('DETECTED', 'CONFIRMED', 'CREDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'CREDITED', 'VOID');

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_address" TEXT NOT NULL,
    "wallet_provider" "WalletProvider",
    "username" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6),
    "referral_code" TEXT NOT NULL,
    "referred_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "game" "Game" NOT NULL,
    "in_game_tag" TEXT NOT NULL,
    "friend_link" TEXT,
    "trophies" INTEGER,
    "account_level" INTEGER,
    "win_rate_bps" INTEGER,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "game_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game" "Game" NOT NULL,
    "template" "RuleTemplate" NOT NULL,
    "mode" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "verification_config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "duel_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "short_code" TEXT NOT NULL,
    "invite_token" TEXT,
    "game" "Game" NOT NULL,
    "visibility" "DuelVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "DuelStatus" NOT NULL DEFAULT 'CREATED',
    "funding_mode" "DuelFundingMode" NOT NULL DEFAULT 'CREDITS',
    "creator_id" UUID NOT NULL,
    "opponent_id" UUID,
    "creator_game_account_id" UUID,
    "opponent_game_account_id" UUID,
    "creator_friend_link" TEXT NOT NULL,
    "opponent_friend_link" TEXT,
    "rule_id" UUID NOT NULL,
    "stake_lamports" BIGINT NOT NULL,
    "platform_fee_bps" INTEGER NOT NULL,
    "winner_payout_lamports" BIGINT,
    "fee_collected_lamports" BIGINT,
    "escrow_seed" TEXT NOT NULL,
    "escrow_pda" TEXT,
    "winner_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "escrow_funded_at" TIMESTAMPTZ(6),
    "activated_at" TIMESTAMPTZ(6),
    "verifying_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "duels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "duel_id" UUID NOT NULL,
    "type" "EscrowTxType" NOT NULL,
    "status" "EscrowTxStatus" NOT NULL DEFAULT 'PENDING',
    "amount_lamports" BIGINT NOT NULL,
    "from_wallet" TEXT,
    "to_wallet" TEXT,
    "signature" TEXT,
    "slot" BIGINT,
    "block_time" TIMESTAMPTZ(6),
    "idempotency_key" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "escrow_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "duel_id" UUID NOT NULL,
    "status" "VerificationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "outcome" "VerificationOutcome",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 40,
    "detected_winner_id" UUID,
    "detected_battle_id" TEXT,
    "matched_battle_at" TIMESTAMPTZ(6),
    "provider_response" JSONB,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "format" "TournamentFormat" NOT NULL DEFAULT 'SINGLE_ELIMINATION',
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "entry_fee_lamports" BIGINT NOT NULL,
    "max_participants" INTEGER NOT NULL,
    "prize_distribution" JSONB NOT NULL,
    "prize_pool_lamports" BIGINT NOT NULL DEFAULT 0,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "registration_closes_at" TIMESTAMPTZ(6),
    "rule_id" UUID,
    "created_by_admin_id" UUID NOT NULL,
    "winner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_players" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tournament_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_account_id" UUID,
    "friend_link" TEXT,
    "status" "TournamentPlayerStatus" NOT NULL DEFAULT 'REGISTERED',
    "seed" INTEGER,
    "final_placement" INTEGER,
    "entry_tx_signature" TEXT,
    "eliminated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournament_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tournament_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "bracket_position" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "player_one_id" UUID,
    "player_two_id" UUID,
    "winner_id" UUID,
    "duel_id" UUID,
    "next_match_id" UUID,
    "scheduled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "duel_id" UUID NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "raised_by_id" UUID,
    "resolved_by_admin_id" UUID,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "available_lamports" BIGINT NOT NULL DEFAULT 0,
    "locked_lamports" BIGINT NOT NULL DEFAULT 0,
    "lifetime_deposited_lamports" BIGINT NOT NULL DEFAULT 0,
    "lifetime_withdrawn_lamports" BIGINT NOT NULL DEFAULT 0,
    "lifetime_won_lamports" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "delta_available" BIGINT NOT NULL,
    "delta_locked" BIGINT NOT NULL,
    "available_after" BIGINT NOT NULL,
    "locked_after" BIGINT NOT NULL,
    "deposit_id" UUID,
    "withdrawal_id" UUID,
    "duel_id" UUID,
    "referral_id" UUID,
    "tournament_id" UUID,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'DETECTED',
    "from_wallet" TEXT NOT NULL,
    "to_treasury_wallet" TEXT NOT NULL,
    "tx_signature" TEXT NOT NULL,
    "slot" BIGINT,
    "block_time" TIMESTAMPTZ(6),
    "gross_lamports" BIGINT NOT NULL,
    "fee_lamports" BIGINT NOT NULL,
    "credited_lamports" BIGINT NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "credited_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'APPROVED',
    "amount_lamports" BIGINT NOT NULL,
    "destination_wallet" TEXT NOT NULL,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "held_reason" TEXT,
    "reviewed_by_admin_id" UUID,
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "tx_signature" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referrer_id" UUID NOT NULL,
    "referee_id" UUID NOT NULL,
    "trigger_deposit_id" UUID,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "reward_bps" INTEGER NOT NULL,
    "reward_lamports" BIGINT NOT NULL DEFAULT 0,
    "credited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_challenges_nonce_key" ON "auth_challenges"("nonce");

-- CreateIndex
CREATE INDEX "auth_challenges_wallet_address_idx" ON "auth_challenges"("wallet_address");

-- CreateIndex
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_referred_by_id_idx" ON "users"("referred_by_id");

-- CreateIndex
CREATE INDEX "game_accounts_game_trophies_idx" ON "game_accounts"("game", "trophies");

-- CreateIndex
CREATE INDEX "game_accounts_game_account_level_idx" ON "game_accounts"("game", "account_level");

-- CreateIndex
CREATE INDEX "game_accounts_game_win_rate_bps_idx" ON "game_accounts"("game", "win_rate_bps");

-- CreateIndex
CREATE INDEX "game_accounts_user_id_idx" ON "game_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_accounts_user_id_game_key" ON "game_accounts"("user_id", "game");

-- CreateIndex
CREATE UNIQUE INDEX "game_accounts_game_in_game_tag_key" ON "game_accounts"("game", "in_game_tag");

-- CreateIndex
CREATE UNIQUE INDEX "duel_rules_template_key" ON "duel_rules"("template");

-- CreateIndex
CREATE INDEX "duel_rules_game_enabled_idx" ON "duel_rules"("game", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "duel_rules_game_template_key" ON "duel_rules"("game", "template");

-- CreateIndex
CREATE UNIQUE INDEX "duels_short_code_key" ON "duels"("short_code");

-- CreateIndex
CREATE UNIQUE INDEX "duels_invite_token_key" ON "duels"("invite_token");

-- CreateIndex
CREATE UNIQUE INDEX "duels_escrow_seed_key" ON "duels"("escrow_seed");

-- CreateIndex
CREATE UNIQUE INDEX "duels_escrow_pda_key" ON "duels"("escrow_pda");

-- CreateIndex
CREATE INDEX "duels_visibility_status_expires_at_idx" ON "duels"("visibility", "status", "expires_at");

-- CreateIndex
CREATE INDEX "duels_game_status_idx" ON "duels"("game", "status");

-- CreateIndex
CREATE INDEX "duels_status_expires_at_idx" ON "duels"("status", "expires_at");

-- CreateIndex
CREATE INDEX "duels_creator_id_idx" ON "duels"("creator_id");

-- CreateIndex
CREATE INDEX "duels_opponent_id_idx" ON "duels"("opponent_id");

-- CreateIndex
CREATE INDEX "duels_stake_lamports_idx" ON "duels"("stake_lamports");

-- CreateIndex
CREATE INDEX "duels_created_at_idx" ON "duels"("created_at");

-- CreateIndex
CREATE INDEX "duels_winner_id_idx" ON "duels"("winner_id");

-- CreateIndex
CREATE INDEX "duels_rule_id_idx" ON "duels"("rule_id");

-- CreateIndex
CREATE INDEX "duels_creator_game_account_id_idx" ON "duels"("creator_game_account_id");

-- CreateIndex
CREATE INDEX "duels_opponent_game_account_id_idx" ON "duels"("opponent_game_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transactions_signature_key" ON "escrow_transactions"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transactions_idempotency_key_key" ON "escrow_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "escrow_transactions_duel_id_idx" ON "escrow_transactions"("duel_id");

-- CreateIndex
CREATE INDEX "escrow_transactions_type_status_idx" ON "escrow_transactions"("type", "status");

-- CreateIndex
CREATE INDEX "escrow_transactions_status_created_at_idx" ON "escrow_transactions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_jobs_duel_id_key" ON "verification_jobs"("duel_id");

-- CreateIndex
CREATE INDEX "verification_jobs_status_scheduled_at_idx" ON "verification_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "verification_jobs_outcome_idx" ON "verification_jobs"("outcome");

-- CreateIndex
CREATE INDEX "verification_jobs_detected_battle_id_idx" ON "verification_jobs"("detected_battle_id");

-- CreateIndex
CREATE INDEX "verification_jobs_detected_winner_id_idx" ON "verification_jobs"("detected_winner_id");

-- CreateIndex
CREATE INDEX "tournaments_status_start_time_idx" ON "tournaments"("status", "start_time");

-- CreateIndex
CREATE INDEX "tournaments_game_status_idx" ON "tournaments"("game", "status");

-- CreateIndex
CREATE INDEX "tournaments_start_time_idx" ON "tournaments"("start_time");

-- CreateIndex
CREATE INDEX "tournaments_rule_id_idx" ON "tournaments"("rule_id");

-- CreateIndex
CREATE INDEX "tournaments_created_by_admin_id_idx" ON "tournaments"("created_by_admin_id");

-- CreateIndex
CREATE INDEX "tournaments_winner_id_idx" ON "tournaments"("winner_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_players_entry_tx_signature_key" ON "tournament_players"("entry_tx_signature");

-- CreateIndex
CREATE INDEX "tournament_players_tournament_id_status_idx" ON "tournament_players"("tournament_id", "status");

-- CreateIndex
CREATE INDEX "tournament_players_user_id_idx" ON "tournament_players"("user_id");

-- CreateIndex
CREATE INDEX "tournament_players_game_account_id_idx" ON "tournament_players"("game_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_players_tournament_id_user_id_key" ON "tournament_players"("tournament_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_matches_duel_id_key" ON "tournament_matches"("duel_id");

-- CreateIndex
CREATE INDEX "tournament_matches_tournament_id_status_idx" ON "tournament_matches"("tournament_id", "status");

-- CreateIndex
CREATE INDEX "tournament_matches_tournament_id_round_idx" ON "tournament_matches"("tournament_id", "round");

-- CreateIndex
CREATE INDEX "tournament_matches_next_match_id_idx" ON "tournament_matches"("next_match_id");

-- CreateIndex
CREATE INDEX "tournament_matches_player_one_id_idx" ON "tournament_matches"("player_one_id");

-- CreateIndex
CREATE INDEX "tournament_matches_player_two_id_idx" ON "tournament_matches"("player_two_id");

-- CreateIndex
CREATE INDEX "tournament_matches_winner_id_idx" ON "tournament_matches"("winner_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_matches_tournament_id_round_bracket_position_key" ON "tournament_matches"("tournament_id", "round", "bracket_position");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_duel_id_key" ON "disputes"("duel_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_resolved_by_admin_id_idx" ON "disputes"("resolved_by_admin_id");

-- CreateIndex
CREATE INDEX "disputes_created_at_idx" ON "disputes"("created_at");

-- CreateIndex
CREATE INDEX "disputes_raised_by_id_idx" ON "disputes"("raised_by_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_admin_id_created_at_idx" ON "admin_audit_log"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log"("action");

-- CreateIndex
CREATE INDEX "admin_audit_log_entity_type_entity_id_idx" ON "admin_audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_balances_user_id_key" ON "user_balances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_created_at_idx" ON "ledger_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries"("type");

-- CreateIndex
CREATE INDEX "ledger_entries_duel_id_idx" ON "ledger_entries"("duel_id");

-- CreateIndex
CREATE INDEX "ledger_entries_deposit_id_idx" ON "ledger_entries"("deposit_id");

-- CreateIndex
CREATE INDEX "ledger_entries_withdrawal_id_idx" ON "ledger_entries"("withdrawal_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tournament_id_idx" ON "ledger_entries"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_tx_signature_key" ON "deposits"("tx_signature");

-- CreateIndex
CREATE INDEX "deposits_user_id_created_at_idx" ON "deposits"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_tx_signature_key" ON "withdrawal_requests"("tx_signature");

-- CreateIndex
CREATE INDEX "withdrawal_requests_user_id_created_at_idx" ON "withdrawal_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_reviewed_by_admin_id_idx" ON "withdrawal_requests"("reviewed_by_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referee_id_key" ON "referrals"("referee_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_trigger_deposit_id_key" ON "referrals"("trigger_deposit_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_accounts" ADD CONSTRAINT "game_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_creator_game_account_id_fkey" FOREIGN KEY ("creator_game_account_id") REFERENCES "game_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_opponent_game_account_id_fkey" FOREIGN KEY ("opponent_game_account_id") REFERENCES "game_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "duel_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_jobs" ADD CONSTRAINT "verification_jobs_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_jobs" ADD CONSTRAINT "verification_jobs_detected_winner_id_fkey" FOREIGN KEY ("detected_winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "duel_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_game_account_id_fkey" FOREIGN KEY ("game_account_id") REFERENCES "game_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player_one_id_fkey" FOREIGN KEY ("player_one_id") REFERENCES "tournament_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player_two_id_fkey" FOREIGN KEY ("player_two_id") REFERENCES "tournament_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "tournament_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_next_match_id_fkey" FOREIGN KEY ("next_match_id") REFERENCES "tournament_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_admin_id_fkey" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_trigger_deposit_id_fkey" FOREIGN KEY ("trigger_deposit_id") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
