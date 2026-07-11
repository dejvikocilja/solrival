import { z } from "zod";
import { base58SignatureSchema } from "./../schemas/auth";

/** On-chain minimum stake (0.001 SOL). Max guards fat-finger errors. */
export const MIN_STAKE_LAMPORTS = 1_000_000n;
export const MAX_STAKE_LAMPORTS = 1_000_000_000_000n; // 1000 SOL

export const gameSchema = z.enum(["CLASH_ROYALE", "BRAWL_STARS"]);
export type Game = z.infer<typeof gameSchema>;

export const ruleTemplateSchema = z.enum([
  "CR_TRIPLE_DRAFT",
  "CR_DRAFT",
  "CR_CLASSIC_DECK",
  "CR_SUDDEN_DEATH",
  "BS_KNOCKOUT",
  "BS_BRAWL_BALL",
  "BS_GEM_GRAB",
]);
export type RuleTemplate = z.infer<typeof ruleTemplateSchema>;

export const duelVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export type DuelVisibility = z.infer<typeof duelVisibilitySchema>;

/** Which rule templates belong to which game (enforced on create). */
export const RULES_BY_GAME: Record<Game, RuleTemplate[]> = {
  CLASH_ROYALE: ["CR_TRIPLE_DRAFT", "CR_DRAFT", "CR_CLASSIC_DECK", "CR_SUDDEN_DEATH"],
  BRAWL_STARS: ["BS_KNOCKOUT", "BS_BRAWL_BALL", "BS_GEM_GRAB"],
};

const FRIEND_LINK_HOST: Record<Game, string> = {
  CLASH_ROYALE: "link.clashroyale.com",
  BRAWL_STARS: "link.brawlstars.com",
};

/** Validates a friend link belongs to the expected game's official host. */
export function isValidFriendLink(game: Game, link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === "https:" && url.host === FRIEND_LINK_HOST[game];
  } catch {
    return false;
  }
}

/** Lamports as a decimal string (JSON has no BigInt); bounded to a sane range. */
export const stakeLamportsSchema = z
  .string()
  .regex(/^\d+$/, "Stake must be a positive integer (lamports)")
  .transform((s) => BigInt(s))
  .refine((v) => v >= MIN_STAKE_LAMPORTS, { message: "Stake below minimum (0.001 SOL)" })
  .refine((v) => v <= MAX_STAKE_LAMPORTS, { message: "Stake above maximum" });

// ---- POST /api/duels --------------------------------------------------------
export const createDuelSchema = z
  .object({
    game: gameSchema,
    ruleTemplate: ruleTemplateSchema,
    visibility: duelVisibilitySchema,
    stakeLamports: stakeLamportsSchema,
  })
  .superRefine((val, ctx) => {
    if (!RULES_BY_GAME[val.game].includes(val.ruleTemplate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ruleTemplate"], message: "Rule template does not match game" });
    }
  });
export type CreateDuelInput = z.infer<typeof createDuelSchema>;

// ---- POST /api/duels/:id/accept --------------------------------------------
// Accept carries no body fields: the opponent's friend link is snapshotted
// server-side from their linked GameAccount (Settings -> Game accounts).
export const acceptDuelSchema = z.object({});
export type AcceptDuelInput = z.infer<typeof acceptDuelSchema>;

// ---- POST /api/duels/:id/confirm -------------------------------------------
export const confirmPhaseSchema = z.enum(["deposit", "accept", "cancel"]);
export const confirmDuelSchema = z.object({
  phase: confirmPhaseSchema,
  signature: base58SignatureSchema,
});
export type ConfirmDuelInput = z.infer<typeof confirmDuelSchema>;

// ---- GET /api/duels (marketplace list) -------------------------------------
export const duelSortSchema = z
  .enum(["EXPIRING_SOON", "NEWEST", "STAKE_HIGH", "STAKE_LOW"])
  .default("EXPIRING_SOON");
export type DuelSort = z.infer<typeof duelSortSchema>;

export const listDuelsQuerySchema = z.object({
  game: gameSchema.optional(),
  minStakeLamports: z.coerce.bigint().optional(),
  maxStakeLamports: z.coerce.bigint().optional(),
  minTrophies: z.coerce.number().int().min(0).optional(),
  maxTrophies: z.coerce.number().int().min(0).optional(),
  minAccountLevel: z.coerce.number().int().min(0).optional(),
  maxAccountLevel: z.coerce.number().int().min(0).optional(),
  minWinRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
  sort: duelSortSchema,
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type ListDuelsQuery = z.infer<typeof listDuelsQuerySchema>;
