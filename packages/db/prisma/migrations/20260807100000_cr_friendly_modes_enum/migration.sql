-- Six more Clash Royale friendly-battle modes.
-- Enum values must be committed before they can be referenced in INSERTs, so
-- the rows are seeded in the migration that follows this one.

ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'CR_DOUBLE_ELIXIR';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'CR_TRIPLE_ELIXIR';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'CR_RAMP_UP';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'CR_SEVEN_X_ELIXIR';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'CR_RAGE';
ALTER TYPE "RuleTemplate" ADD VALUE IF NOT EXISTS 'CR_MIRROR';
