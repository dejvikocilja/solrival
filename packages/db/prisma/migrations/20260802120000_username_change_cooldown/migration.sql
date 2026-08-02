-- Tracks when a user last changed their username, to enforce a change cooldown.
-- Nullable: existing accounts have never changed theirs, so they keep one free
-- change. Backfilling with created_at would instead punish every current user
-- with a cooldown they never triggered.
ALTER TABLE "users" ADD COLUMN "username_changed_at" TIMESTAMPTZ(6);
