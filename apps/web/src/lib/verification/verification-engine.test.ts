import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Battle-selection tests for the verification engine.
 *
 * These pin the rule that decides which battle settles a duel when more than
 * one qualifies. Getting it wrong is a money bug, not a cosmetic one: the
 * engine previously took the MOST RECENT candidate, which let a player who had
 * just lost play a second friendly in the same mode, win it, and have the
 * sweep settle the duel on that later battle before the original result was
 * processed.
 */

const findFirst = vi.fn();
const findMany = vi.fn();
const updateMany = vi.fn();

vi.mock("@solrival/db", () => ({
  prisma: {
    verificationJob: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

const fetchCR = vi.fn();
const fetchBS = vi.fn();
vi.mock("./clash-royale", () => ({ fetchClashRoyaleBattles: (...a: unknown[]) => fetchCR(...a) }));
vi.mock("./brawl-stars", () => ({ fetchBrawlStarsBattles: (...a: unknown[]) => fetchBS(...a) }));

import { findMatchingBattle } from "./verification-engine";
import type { DuelVerificationContext, BattleRecord } from "./types";

const P1 = "#AAA";
const P2 = "#BBB";
const ACCEPTED = new Date("2026-08-07T12:00:00.000Z");

function battle(minutesAfterAccept: number, winnerTag: string): BattleRecord {
  return {
    battleTime: new Date(ACCEPTED.getTime() + minutesAfterAccept * 60_000),
    gameId: "clash-royale",
    mode: "Draft_Competitive",
    player1Tag: P1,
    player2Tag: P2,
    winnerTag,
  } as BattleRecord;
}

/** Mirrors the engine's battle key: ISO time + both normalised tags. */
function key(b: BattleRecord): string {
  const norm = (t: string) => t.toUpperCase().replace(/^#?/, "#");
  return [b.battleTime.toISOString(), norm(b.player1Tag), norm(b.player2Tag)].join(":");
}

const ctx: DuelVerificationContext = {
  duelId: "duel-current",
  gameId: "clash-royale",
  gameMode: "Draft_Competitive",
  player1Tag: P1,
  player2Tag: P2,
  acceptedAt: ACCEPTED,
} as DuelVerificationContext;

describe("findMatchingBattle — which battle settles the duel", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findMany.mockReset().mockResolvedValue([]);
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    fetchCR.mockReset();
    fetchBS.mockReset();
  });

  it("takes the EARLIEST valid battle, not the most recent", async () => {
    // P1 wins at +5. P1 then loses a replay at +9. The duel must settle on the
    // first battle — otherwise the replay overwrites a decided result.
    const first = battle(5, P1);
    const replay = battle(9, P2);
    fetchCR.mockResolvedValue([replay, first]); // API returns newest-first

    const result = await findMatchingBattle(ctx);

    expect(result?.battleTime.toISOString()).toBe(first.battleTime.toISOString());
    expect(result?.winnerTag).toBe(P1);
  });

  it("ignores battles played before the duel was accepted", async () => {
    const stale = battle(-30, P2);
    const valid = battle(4, P1);
    fetchCR.mockResolvedValue([valid, stale]);

    const result = await findMatchingBattle(ctx);
    expect(result?.winnerTag).toBe(P1);
  });

  it("skips a battle already claimed by another duel and takes the next one", async () => {
    // Two legitimate duels between the same players in one window — e.g.
    // back-to-back tournament matches. The first duel claimed the first
    // battle; this duel must settle on the second, not give up.
    const firstBattle = battle(3, P1);
    const secondBattle = battle(8, P2);
    fetchCR.mockResolvedValue([secondBattle, firstBattle]);

    const claimedKey = key(firstBattle);
    findMany.mockResolvedValue([{ detectedBattleId: claimedKey, duelId: "duel-other" }]);

    const result = await findMatchingBattle(ctx);
    expect(result?.battleTime.toISOString()).toBe(secondBattle.battleTime.toISOString());
  });

  it("returns null when every candidate is claimed", async () => {
    const only = battle(3, P1);
    fetchCR.mockResolvedValue([only]);
    findMany.mockResolvedValue([
      { detectedBattleId: key(only), duelId: "duel-other" },
    ]);

    expect(await findMatchingBattle(ctx)).toBeNull();
  });

  it("returns null when no battle matches at all", async () => {
    fetchCR.mockResolvedValue([]);
    expect(await findMatchingBattle(ctx)).toBeNull();
  });
});
