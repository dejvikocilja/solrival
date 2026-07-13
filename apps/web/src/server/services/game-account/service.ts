import "server-only";
import { prisma, type Game, type GameAccount } from "@solrival/db";
import type { LinkGameAccountInput } from "@solrival/shared";
import { fetchPlayerProfile } from "@/lib/verification/players";
import { SupercellApiError } from "@/lib/verification/supercell-client";
import type { GameId } from "@/lib/verification/types";

/**
 * Game accounts are the backbone of trustless verification: the verifier can
 * only match battles for tags it knows about, and a matched opponent (a
 * stranger) can only be added in-game through the friend invite link. Linking
 * therefore validates the tag against the REAL game API (typos and made-up
 * tags are rejected at the door) and requires the invite link up front. Duel
 * creation and acceptance refuse to proceed without a linked account, which
 * eliminates structurally-unverifiable duels at the root.
 */

export class GameAccountError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GameAccountError";
  }
}

const GAME_LABEL: Record<Game, string> = {
  CLASH_ROYALE: "Clash Royale",
  BRAWL_STARS: "Brawl Stars",
};

const toGameId = (game: Game): GameId => (game === "CLASH_ROYALE" ? "clash-royale" : "brawl-stars");

/** Public shape returned to the client (never expose internal ids of others). */
export interface GameAccountView {
  game: Game;
  inGameTag: string;
  inGameName: string | null;
  friendLink: string | null;
  trophies: number | null;
  lastSyncedAt: Date | null;
}

function toView(a: GameAccount & { inGameName?: string | null }): GameAccountView {
  return {
    game: a.game,
    inGameTag: a.inGameTag,
    inGameName: null,
    friendLink: a.friendLink,
    trophies: a.trophies,
    lastSyncedAt: a.lastSyncedAt,
  };
}

/** The caller's linked accounts (0–2 rows, one per game). */
export async function listGameAccounts(userId: string): Promise<GameAccountView[]> {
  const rows = await prisma.gameAccount.findMany({ where: { userId }, orderBy: { game: "asc" } });
  return rows.map(toView);
}

/**
 * Links (or re-links) the caller's account for one game.
 *
 * Validates the tag against the live game API: a tag that doesn't exist is a
 * 404 → friendly 400 here. The profile's canonical tag, trophies, and level
 * are stored for the arena, and `lastSyncedAt` records the check. A tag
 * already linked by ANOTHER user is rejected — one in-game identity can't
 * back two platform accounts (it would let one person duel themself).
 */
export async function linkGameAccount(
  userId: string,
  input: LinkGameAccountInput,
): Promise<GameAccountView & { inGameName: string }> {
  let profile;
  try {
    profile = await fetchPlayerProfile(toGameId(input.game), input.playerTag);
  } catch (err) {
    if (err instanceof SupercellApiError) {
      throw new GameAccountError(
        "GAME_API_UNAVAILABLE",
        `Couldn't reach the ${GAME_LABEL[input.game]} API to verify the tag — try again in a minute`,
        503,
      );
    }
    throw err;
  }
  if (profile === null) {
    throw new GameAccountError(
      "PLAYER_NOT_FOUND",
      `No ${GAME_LABEL[input.game]} player exists with tag ${input.playerTag} — check it in-game and try again`,
      400,
    );
  }

  // One in-game account backs at most one platform account.
  const taken = await prisma.gameAccount.findFirst({
    where: { game: input.game, inGameTag: profile.tag, userId: { not: userId } },
    select: { id: true },
  });
  if (taken) {
    throw new GameAccountError(
      "TAG_ALREADY_LINKED",
      `That ${GAME_LABEL[input.game]} account is already linked to another SolRival user`,
      409,
    );
  }

  const row = await prisma.gameAccount.upsert({
    where: { userId_game: { userId, game: input.game } },
    create: {
      userId,
      game: input.game,
      inGameTag: profile.tag,
      friendLink: input.friendLink,
      trophies: profile.trophies,
      accountLevel: profile.level,
      lastSyncedAt: new Date(),
    },
    update: {
      inGameTag: profile.tag,
      friendLink: input.friendLink,
      trophies: profile.trophies,
      accountLevel: profile.level,
      lastSyncedAt: new Date(),
    },
  });

  return { ...toView(row), inGameName: profile.name };
}

/**
 * Loads the caller's linked account for a game, or throws a clear 400 telling
 * them to link it in Settings — used by duel create/accept so every duel is
 * verifiable and every matched player is reachable in-game.
 */
export async function requireLinkedGameAccount(
  userId: string,
  game: Game,
): Promise<{ id: string; inGameTag: string; friendLink: string }> {
  const account = await prisma.gameAccount.findUnique({
    where: { userId_game: { userId, game } },
    select: { id: true, inGameTag: true, friendLink: true },
  });
  if (!account) {
    throw new GameAccountError(
      "GAME_ACCOUNT_REQUIRED",
      `Link your ${GAME_LABEL[game]} account in Settings before entering a ${GAME_LABEL[game]} duel`,
      400,
    );
  }
  if (!account.friendLink) {
    throw new GameAccountError(
      "FRIEND_LINK_REQUIRED",
      `Add your ${GAME_LABEL[game]} friend invite link in Settings — your opponent needs it to play you`,
      400,
    );
  }
  return { id: account.id, inGameTag: account.inGameTag, friendLink: account.friendLink };
}
