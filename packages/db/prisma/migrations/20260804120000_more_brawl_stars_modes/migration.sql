-- Adds four more Brawl Stars duel modes.
--
-- The Brawl Stars battle parser is mode-agnostic for team modes (any battle
-- with two or more teams and a `result` field), so these need no parser change
-- — only the rule rows the engine matches against.
--
-- Enum values must be committed before they can be used in INSERTs, so the
-- ALTER TYPE statements run in their own transaction via ALTER TYPE ... ADD
-- VALUE IF NOT EXISTS, and the seeding happens in a later migration step.

ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'BS_HEIST';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'BS_BOUNTY';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'BS_HOT_ZONE';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'BS_DUELS';
