# SolRival — Indexing Strategy

Indexes are chosen from the actual read paths in the spec (marketplace, profiles, admin queues, verifier sweeps), not added speculatively. UUID PKs are random, so we never range-scan on `id`; time-ordered scans use `created_at`/`expires_at`.

## Hot path — Marketplace

Query: public, joinable duels, filtered, sorted by soonest expiry ("Expiring Soon").

- `@@index([visibility, status, expires_at])` on `duels` covers the common composite + sort.
- **Partial index** `duels_marketplace_open_idx ON duels(expires_at) WHERE visibility='PUBLIC' AND status IN ('CREATED','WAITING_FOR_OPPONENT')` — small and selective; the planner uses it for the default feed, ignoring completed/expired rows entirely.
- Filter columns live on `game_accounts` (trophies, account level, win rate). `@@index([game, trophies])`, `[game, account_level]`, `[game, win_rate_bps]` support range filters when joining the creator's account.
- `@@index([stake_lamports])` for the stake-amount filter.

## Duels — operational

- `@@index([game, status])`, `@@index([status, expires_at])` — admin search + status dashboards.
- `@@index([creator_id])`, `@@index([opponent_id])` — profile duel history.
- Partial `duels_verifying_idx WHERE status='VERIFYING'` and `duels_expiry_sweep_idx WHERE status IN ('CREATED','WAITING_FOR_OPPONENT','ACCEPTED')` — the verifier's two background sweeps touch only live rows.
- Unique `escrow_seed`, `escrow_pda`, `short_code`, `invite_token` — lookups by share link / on-chain address; nulls allowed (public duels have no `invite_token`).

## Verification

- `verification_jobs.duel_id` unique — 1:1 with duel, idempotent upserts.
- `@@index([status, scheduled_at])` + partial `vjobs_runnable_idx WHERE status IN ('QUEUED','RETRYING')` — queue pickup ordered by schedule.
- `@@index([detected_battle_id])` — dedupe / trace a Supercell battle record.
- `@@index([outcome])` — admin verification-failure monitoring.

## Escrow ledger

- `@@index([duel_id])` — all movements for a duel (timeline, audit).
- `@@index([type, status])`, `@@index([status, created_at])` — settlement reconciliation, pending-tx retries.
- Unique `signature` + `idempotency_key` — double-settlement protection.

## Tournaments

- `@@index([status, start_time])`, `@@index([game, status])`, `@@index([start_time])` — listing + featured upcoming.
- `tournament_players` `@@unique([tournament_id, user_id])` (no double-registration) + `@@index([tournament_id, status])`, `@@index([user_id])`.
- `tournament_matches` `@@unique([tournament_id, round, bracket_position])` (bracket slot integrity) + `@@index([tournament_id, status])`, `[tournament_id, round]`, `[next_match_id]` for progression walks.

## Profiles

- `users.wallet_address` unique (lookup by wallet), `username` unique + `lower(username)` unique (case-insensitive). `@@index([role])` for admin lists.
- `game_accounts` `@@unique([user_id, game])`, `@@unique([game, in_game_tag])` (tag ownership) — also the verifier's lookup to map a battle-log player tag back to a user.

## Admin / disputes

- `admin_audit_log`: `@@index([admin_id, created_at])`, `[action]`, `[entity_type, entity_id]` (trace everything done to one entity), `[created_at]`.
- `disputes`: `@@index([status])`, `[resolved_by_admin_id]`, `[created_at]`, plus partial `disputes_open_idx WHERE status IN ('OPEN','UNDER_REVIEW')` for the admin queue.

## Principles applied

- Composite indexes are ordered **equality-first, range/sort-last** (e.g. `[visibility, status, expires_at]`).
- Partial indexes everywhere a query targets a small live subset of a large table — keeps them tiny and cache-resident.
- No redundant single-column index when a composite already has it as a prefix.
- Re-evaluate with `pg_stat_user_indexes` / `EXPLAIN ANALYZE` against real traffic before adding more.
