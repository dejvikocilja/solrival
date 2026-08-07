-- Clash Royale friendly-battle modes, using the names the API actually returns.
--
-- Source: RoyaleAPI cr-api-data game_modes.json (mirrors Supercell's game
-- data), cross-checked against a real battlelog capture. Every mode below is
-- players = PvP, no_draws = true (a winner is always produced), and is decided
-- on crowns.
--
--   Friendly               id 72000007  Collection        timeline Default
--   Overtime_Friendly      id 72000031  Collection        timeline SuddenDeath
--   DoubleElixir_Friendly  id 72000011  Collection        timeline DoubleElixir
--   TripleElixir_Friendly  id 72000032  Collection        timeline TripleElixir
--   RampUpElixir_Friendly  id 72000033  Collection        timeline RampUp
--   7xElixir_Friendly      id 72000232  Collection        timeline 7xElixir
--   Rage_Friendly          id 72000071  Collection        timeline RageMode
--   MirrorDeck_Friendly    id 72000254  Predefined        timeline Default
--   DraftMode              id 72000005  Draft
--   Draft_Competitive      id 72000194  DraftCompetitive
--
-- Note on the two rules fixed below:
--   * Classic Deck reports as "Friendly", NOT "Ladder". That distinction
--     matters: an ordinary ranked match reports "Ladder", so a Ladder-named
--     rule could have been satisfied by a ranked game neither player entered
--     as a duel. "Friendly" cannot be produced by ranked play.
--   * Sudden Death is "Overtime_Friendly" — confirmed by its battle_timeline
--     value of "SuddenDeath". No mode literally named SuddenDeath exists.

UPDATE "duel_rules"
SET mode = 'Friendly',
    display_name = 'Classic Friendly Battle',
    description = 'Standard friendly 1v1 with your own deck. Winner = higher crowns.',
    verification_config = '{"type":"friendly","gameMode":["Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb,
    enabled = true, updated_at = now()
WHERE template = 'CR_CLASSIC_DECK';

UPDATE "duel_rules"
SET mode = 'Overtime_Friendly',
    display_name = 'Sudden Death Friendly Battle',
    description = 'Starts in overtime — first crown wins.',
    verification_config = '{"type":"friendly","gameMode":["Overtime_Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb,
    enabled = true, updated_at = now()
WHERE template = 'CR_SUDDEN_DEATH';

INSERT INTO "duel_rules" (id, game, template, mode, display_name, description, verification_config, enabled, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'CLASH_ROYALE', 'CR_DOUBLE_ELIXIR', 'DoubleElixir_Friendly', 'Double Elixir Friendly Battle',
   'Double elixir from the first second. Winner = higher crowns.',
   '{"type":"friendly","gameMode":["DoubleElixir_Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb, true, now(), now()),

  (gen_random_uuid(), 'CLASH_ROYALE', 'CR_TRIPLE_ELIXIR', 'TripleElixir_Friendly', 'Triple Elixir Friendly Battle',
   'Triple elixir from the first second. Winner = higher crowns.',
   '{"type":"friendly","gameMode":["TripleElixir_Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb, true, now(), now()),

  (gen_random_uuid(), 'CLASH_ROYALE', 'CR_RAMP_UP', 'RampUpElixir_Friendly', 'Ramp Up Friendly Battle',
   'Elixir speed climbs as the match goes on. Winner = higher crowns.',
   '{"type":"friendly","gameMode":["RampUpElixir_Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb, true, now(), now()),

  (gen_random_uuid(), 'CLASH_ROYALE', 'CR_SEVEN_X_ELIXIR', '7xElixir_Friendly', '7x Elixir Friendly Battle',
   'Seven times elixir. Chaos, decided on crowns.',
   '{"type":"friendly","gameMode":["7xElixir_Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb, true, now(), now()),

  (gen_random_uuid(), 'CLASH_ROYALE', 'CR_RAGE', 'Rage_Friendly', 'Rage Friendly Battle',
   'Everything is permanently raged. Winner = higher crowns.',
   '{"type":"friendly","gameMode":["Rage_Friendly"],"deckSelection":"collection","resultField":"crowns"}'::jsonb, true, now(), now()),

  (gen_random_uuid(), 'CLASH_ROYALE', 'CR_MIRROR', 'MirrorDeck_Friendly', 'Mirror Friendly Battle',
   'Both players use the same deck — pure skill. Winner = higher crowns.',
   '{"type":"friendly","gameMode":["MirrorDeck_Friendly"],"deckSelection":"predefined","resultField":"crowns"}'::jsonb, true, now(), now())
ON CONFLICT (game, template) DO NOTHING;
