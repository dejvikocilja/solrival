-- Seeds the four new Brawl Stars duel rules.
--
-- Separate migration from the enum additions: PostgreSQL will not let a value
-- added by ALTER TYPE be used in the same transaction that added it.
--
-- `mode` is the exact string the Brawl Stars API returns in `event.mode`.
-- `verification_config.gameMode` lists additional accepted spellings; the
-- engine checks `mode` first and only falls back to these, so an empty or
-- wrong alias can never break the canonical match.
--
-- ON CONFLICT DO NOTHING makes this safe to re-run and safe on a database
-- where an operator has already created one of these rules by hand.

INSERT INTO "duel_rules" (id, game, template, mode, display_name, description, verification_config, enabled, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'BRAWL_STARS', 'BS_HEIST', 'heist', 'Heist',
   'Heist friendly battle. Winner = the team that does more safe damage; the API reports the result directly.',
   '{"type":"friendly","event":"heist","resultField":"result","gameMode":["heist"]}'::jsonb,
   true, now(), now()),

  (gen_random_uuid(), 'BRAWL_STARS', 'BS_BOUNTY', 'bounty', 'Bounty',
   'Bounty friendly battle. Winner = the team with more stars when time runs out.',
   '{"type":"friendly","event":"bounty","resultField":"result","gameMode":["bounty"]}'::jsonb,
   true, now(), now()),

  (gen_random_uuid(), 'BRAWL_STARS', 'BS_HOT_ZONE', 'hotZone', 'Hot Zone',
   'Hot Zone friendly battle. Winner = the team that controls the zones to 100%.',
   '{"type":"friendly","event":"hotZone","resultField":"result","gameMode":["hotZone","hotzone"]}'::jsonb,
   true, now(), now()),

  (gen_random_uuid(), 'BRAWL_STARS', 'BS_DUELS', 'duels', 'Duels',
   'Duels friendly battle — a true 1v1 with three brawlers each. Winner = last player standing.',
   '{"type":"friendly","event":"duels","resultField":"result","gameMode":["duels","duel"]}'::jsonb,
   true, now(), now())
ON CONFLICT (game, template) DO NOTHING;
