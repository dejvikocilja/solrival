/**
 * Seeds the duel_rules registry — the 7 predefined, verifiable templates.
 * Duels FK to these rows, so this MUST run before any duel can be created.
 * Run: pnpm --filter @solrival/db exec tsx prisma/seed.ts
 */
import { PrismaClient, Game, RuleTemplate } from "@prisma/client";

const prisma = new PrismaClient();

// verificationConfig tells the verifier how to detect each mode in the battle log.
const RULES: Array<{
  game: Game;
  template: RuleTemplate;
  mode: string;
  displayName: string;
  description: string;
  verificationConfig: Record<string, unknown>;
}> = [
  {
    game: Game.CLASH_ROYALE,
    template: RuleTemplate.CR_TRIPLE_DRAFT,
    mode: "TripleDraft",
    displayName: "Triple Draft Friendly Battle",
    description: "Triple draft friendly 1v1. Winner = higher crowns.",
    verificationConfig: { type: "friendly", gameMode: ["TripleDraft", "TripleElixir_TripleDraft"], resultField: "crowns" },
  },
  {
    game: Game.CLASH_ROYALE,
    template: RuleTemplate.CR_DRAFT,
    mode: "Draft",
    displayName: "Draft Friendly Battle",
    description: "Draft friendly 1v1. Winner = higher crowns.",
    verificationConfig: { type: "friendly", gameMode: ["Draft", "Draft_Ladder"], resultField: "crowns" },
  },
  {
    game: Game.CLASH_ROYALE,
    template: RuleTemplate.CR_CLASSIC_DECK,
    mode: "ClassicDeck",
    displayName: "Classic Deck Friendly Battle",
    description: "Standard deck friendly 1v1. Winner = higher crowns.",
    verificationConfig: { type: "friendly", gameMode: ["Ladder", "Friendly"], resultField: "crowns" },
  },
  {
    game: Game.CLASH_ROYALE,
    template: RuleTemplate.CR_SUDDEN_DEATH,
    mode: "SuddenDeath",
    displayName: "Sudden Death Friendly Battle",
    description: "First tower wins. Winner = first crown.",
    verificationConfig: { type: "friendly", gameMode: ["SuddenDeath", "SuddenDeath_Ladder"], resultField: "crowns" },
  },
  {
    game: Game.BRAWL_STARS,
    template: RuleTemplate.BS_KNOCKOUT,
    mode: "knockout",
    displayName: "Knockout",
    description: "Knockout friendly room. Winner = victory result.",
    verificationConfig: { type: "friendly", event: "knockout", resultField: "result" },
  },
  {
    game: Game.BRAWL_STARS,
    template: RuleTemplate.BS_BRAWL_BALL,
    mode: "brawlBall",
    displayName: "Brawl Ball",
    description: "Brawl Ball friendly room. Winner = victory result.",
    verificationConfig: { type: "friendly", event: "brawlBall", resultField: "result" },
  },
  {
    game: Game.BRAWL_STARS,
    template: RuleTemplate.BS_GEM_GRAB,
    mode: "gemGrab",
    displayName: "Gem Grab",
    description: "Gem Grab friendly room. Winner = victory result.",
    verificationConfig: { type: "friendly", event: "gemGrab", resultField: "result" },
  },
];

async function main() {
  for (const r of RULES) {
    await prisma.duelRule.upsert({
      where: { template: r.template },
      update: {
        game: r.game, mode: r.mode, displayName: r.displayName,
        description: r.description, verificationConfig: r.verificationConfig,
      },
      create: r,
    });
  }
  console.log(`Seeded ${RULES.length} duel rule templates.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
