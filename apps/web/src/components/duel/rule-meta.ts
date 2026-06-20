import type { Game, RuleTemplate } from "@solrival/shared";

/**
 * Client-safe presentation metadata for duel rule templates. The canonical
 * mapping (which template belongs to which game) lives in `RULES_BY_GAME` in
 * @solrival/shared; this only supplies human-facing copy for the form.
 */
export const RULE_META: Record<RuleTemplate, { label: string; summary: string }> = {
  CR_TRIPLE_DRAFT: {
    label: "Triple Draft",
    summary: "Pick from three cards each round, then duel with the deck you build.",
  },
  CR_DRAFT: {
    label: "Draft",
    summary: "Draft a deck from a shared pool — no two players play the same cards.",
  },
  CR_CLASSIC_DECK: {
    label: "Classic Deck",
    summary: "Bring your own deck. Best of one, ladder rules.",
  },
  CR_SUDDEN_DEATH: {
    label: "Sudden Death",
    summary: "First tower decides it. No overtime, no draws.",
  },
  BS_KNOCKOUT: {
    label: "Knockout",
    summary: "3v3 elimination. No respawns — win two rounds to take the duel.",
  },
  BS_BRAWL_BALL: {
    label: "Brawl Ball",
    summary: "Score two goals before your rival. Pure mechanical skill.",
  },
  BS_GEM_GRAB: {
    label: "Gem Grab",
    summary: "Hold ten gems and survive the countdown to win.",
  },
};

/** Friendly host shown as a hint when entering a friend link. */
export const FRIEND_LINK_HINT: Record<Game, string> = {
  CLASH_ROYALE: "link.clashroyale.com",
  BRAWL_STARS: "link.brawlstars.com",
};

/** Where players copy their friend link from, per game. */
export const FRIEND_LINK_HELP: Record<Game, string> = {
  CLASH_ROYALE: "Profile → Add Friend → Copy invite link",
  BRAWL_STARS: "Profile → Friends → Invite → Copy link",
};
