-- Clash Royale rules: use the mode names the API actually returns, and take the
-- unconfirmed ones out of service.
--
-- Every CR rule shipped with an invented label ("TripleDraft", "ClassicDeck")
-- while the battlelog reports values like "Draft_Competitive" and "Ladder" in
-- `gameMode.name`. The engine compares those two strings, so NO Clash Royale
-- duel could ever verify: it sat in VERIFYING with both stakes locked until its
-- window elapsed.
--
-- Confirmed empirically on 2026-08-06 from a real friendly battle:
--   selected in-game "Triple Draft"  ->  gameMode.name "Draft_Competitive"
--                                        deckSelection  "draftCompetitive"
--
-- The other three modes have NOT been observed yet. Rather than guess a name
-- and create duels that lock real SOL and never settle, they are disabled:
-- duel creation requires `enabled = true`, so the platform now refuses to open
-- a duel it cannot verify. Re-enable each one only after a real battle in that
-- mode confirms its name.

UPDATE "duel_rules"
SET mode                = 'Draft_Competitive',
    display_name        = 'Triple Draft Friendly Battle',
    verification_config = '{"type":"friendly","gameMode":["Draft_Competitive"],"deckSelection":"draftCompetitive","resultField":"crowns"}'::jsonb,
    enabled             = true,
    updated_at          = now()
WHERE template = 'CR_TRIPLE_DRAFT';

UPDATE "duel_rules"
SET enabled    = false,
    updated_at = now()
WHERE template IN ('CR_DRAFT', 'CR_CLASSIC_DECK', 'CR_SUDDEN_DEATH');
