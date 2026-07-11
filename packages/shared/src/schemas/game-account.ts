import { z } from "zod";
import { gameSchema, isValidFriendLink, type Game } from "../duel/schemas";

/**
 * Supercell player tags use a restricted 14-character alphabet:
 * 0, 2, 8, 9, P, Y, L, Q, G, R, J, C, V, U — notably NO letter "O".
 * Players constantly type O for 0 (and lowercase), so normalization maps
 * both before validating. The verifier and the game APIs both expect the
 * canonical uppercase "#TAG" form.
 */
const TAG_ALPHABET = /^[0289PYLQGRJCVU]{3,12}$/;

/**
 * Canonicalizes a raw user-typed player tag: trims, uppercases, maps O→0,
 * ensures exactly one leading '#'. Returns null when the result isn't a
 * plausible Supercell tag.
 */
export function normalizePlayerTag(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/^#+/, "").replace(/O/g, "0");
  if (!TAG_ALPHABET.test(cleaned)) return null;
  return `#${cleaned}`;
}

/** PUT /api/game-accounts — link (or update) the caller's account for one game. */
export const linkGameAccountSchema = z
  .object({
    game: gameSchema,
    playerTag: z
      .string()
      .trim()
      .min(3)
      .max(16)
      .transform((raw, ctx) => {
        const tag = normalizePlayerTag(raw);
        if (tag === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "That doesn't look like a valid player tag (e.g. #2PYL9QGR)",
          });
          return z.NEVER;
        }
        return tag;
      }),
    // The in-game friend invite link — REQUIRED, because it's the only way a
    // matched opponent (a stranger) can add this player in-game to play the
    // duel. Shown to the counterparty on the duel page after matching.
    friendLink: z.string().trim().url().max(500),
  })
  .superRefine((val, ctx) => {
    if (!isValidFriendLink(val.game as Game, val.friendLink)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["friendLink"],
        message: "That invite link doesn't match the selected game",
      });
    }
  });

export type LinkGameAccountInput = z.infer<typeof linkGameAccountSchema>;
