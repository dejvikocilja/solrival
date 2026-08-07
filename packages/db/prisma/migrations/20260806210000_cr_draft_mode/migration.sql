-- Clash Royale: enable the plain Draft rule with its real API mode name.
--
-- Source: RoyaleAPI's static game-mode data (cr-api-data/game_modes.json),
-- which mirrors the values the official API returns in `gameMode.name`:
--
--   DraftMode          id 72000005  deck_selection Draft             players PvP
--   Draft_Competitive  id 72000194  deck_selection DraftCompetitive  players PvP
--
-- These are distinct ids and distinct deck selections, so plain Draft and
-- Triple Draft cannot be confused for one another — a Draft battle cannot
-- settle a Triple Draft duel or vice versa.
--
-- Classic Deck and Sudden Death stay disabled on purpose:
--   * "Classic Deck" most likely reports as `Ladder` (deck_selection
--     Collection), which is ALSO what an ordinary ranked match reports. Until
--     the engine enforces `type = "friendly"`, enabling it would let a ranked
--     game settle a staked duel neither player entered as one.
--   * No mode named SuddenDeath exists in the game data at all; the rule was
--     invented. It needs to be re-thought, not renamed.

UPDATE "duel_rules"
SET mode                = 'DraftMode',
    verification_config = '{"type":"friendly","gameMode":["DraftMode"],"deckSelection":"draft","resultField":"crowns"}'::jsonb,
    enabled             = true,
    updated_at          = now()
WHERE template = 'CR_DRAFT';
