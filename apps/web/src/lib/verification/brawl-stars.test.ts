import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Brawl Stars parser tests — the fixtures below are a REAL battlelog captured
 * from the live API during the first manual battle test (2026-07-11), which
 * exposed two production bugs:
 *
 *  1. Showdown battles (`players` + `rank`, no `teams`) were silently dropped
 *     — including genuine 2-player friendly 1v1s with a clear winner.
 *  2. A friendly team-mode match with BOTH duelists on the same side comes
 *     back as a single team; there is no "versus", so it must be rejected —
 *     but with an explicit reason, never silently.
 *
 * These tests replay that exact battlelog and pin the corrected behavior.
 */

vi.mock("./supercell-client", () => ({
  supercellGet: vi.fn(),
  encodePlayerTag: (t: string) => encodeURIComponent(t),
  SupercellApiError: class SupercellApiError extends Error {},
}));

import { fetchBrawlStarsBattles } from "./brawl-stars";
import { supercellGet } from "./supercell-client";
import { normalizeGameMode } from "./types";

const P1 = "#2VLPYPU8PG"; // requester of this battlelog
const P2 = "#2VU2QV80GR";

const brawler = { id: 16000000, name: "SHELLY", power: -1, trophies: -1 };

/** Verbatim structure of the captured battlelog (trimmed to relevant fields). */
const REAL_BATTLELOG = {
  items: [
    {
      // Friendly gemGrab where both duelists sat on the SAME side (vs bots):
      // one team containing both tags. No "versus" → must be skipped as such.
      battleTime: "20260711T200040.000Z",
      event: { id: 15000007, mode: "gemGrab", map: "Hard Rock Mine" },
      battle: {
        mode: "gemGrab",
        type: "friendly",
        result: "victory",
        duration: 79,
        teams: [[{ tag: P1, name: "dejvi2", brawler }, { tag: P2, name: "dejvi", brawler }]],
      },
    },
    {
      // 2-player friendly solo showdown, requester placed 2nd → P2 won.
      battleTime: "20260711T194548.000Z",
      event: { id: 15001284, mode: "soloShowdown", map: "Rice Field" },
      battle: {
        mode: "soloShowdown",
        type: "friendly",
        rank: 2,
        players: [{ tag: P2, name: "dejvi", brawler }, { tag: P1, name: "dejvi2", brawler }],
      },
    },
    {
      // 2-player friendly solo showdown, requester placed 1st → P1 won.
      battleTime: "20260711T120313.000Z",
      event: { id: 15001284, mode: "soloShowdown", map: "Rice Field" },
      battle: {
        mode: "soloShowdown",
        type: "friendly",
        rank: 1,
        players: [{ tag: P1, name: "dejvi2", brawler }, { tag: P2, name: "dejvi", brawler }],
      },
    },
    {
      // Public 10-player ranked showdown: pairwise winner between two specific
      // duelists is unknowable from one record → skipped explicitly.
      battleTime: "20260711T091602.000Z",
      event: { id: 15000487, mode: "soloShowdown", map: "Training Island" },
      battle: {
        mode: "soloShowdown",
        type: "ranked",
        rank: 1,
        trophyChange: 13,
        players: [
          { tag: P1, name: "dejvi2", brawler },
          ...Array.from({ length: 9 }, (_, i) => ({ tag: `#2RYJPVUYY${i}`, name: "Brawler", brawler })),
        ],
      },
    },
  ],
  paging: { cursors: {} },
};

beforeEach(() => {
  vi.mocked(supercellGet).mockReset();
});

describe("fetchBrawlStarsBattles (real captured battlelog)", () => {
  it("parses 2-player showdown duels and decides the winner from rank", async () => {
    vi.mocked(supercellGet).mockResolvedValue(REAL_BATTLELOG);
    const records = await fetchBrawlStarsBattles(P1);

    // gemGrab same-team → skipped; 10-player showdown → skipped; the two
    // 2-player showdowns parse.
    expect(records).toHaveLength(2);

    const [lost, won] = records;
    expect(lost!.winnerTag).toBe(P2); // rank 2 → the other player won
    expect(won!.winnerTag).toBe(P1); // rank 1 → requester won
    for (const r of records) {
      expect([r.player1Tag, r.player2Tag].sort()).toEqual([P1, P2].sort());
      expect(r.mode).toBe("soloshowdown");
      expect(r.gameId).toBe("brawl-stars");
    }
  });

  it("rejects a same-side team battle (no versus) instead of parsing a fake winner", async () => {
    vi.mocked(supercellGet).mockResolvedValue(REAL_BATTLELOG);
    const records = await fetchBrawlStarsBattles(P1);
    // The 20:00 gemGrab (both players in ONE team) must not appear.
    expect(records.some((r) => r.mode === "gemgrab")).toBe(false);
  });

  it("parses a proper opposite-sides team battle with the requester's result", async () => {
    vi.mocked(supercellGet).mockResolvedValue({
      items: [
        {
          battleTime: "20260711T210000.000Z",
          event: { id: 15000007, mode: "gemGrab", map: "Hard Rock Mine" },
          battle: {
            mode: "gemGrab",
            type: "friendly",
            result: "victory",
            teams: [[{ tag: P1, name: "dejvi2", brawler }], [{ tag: P2, name: "dejvi", brawler }]],
          },
        },
      ],
    });
    const records = await fetchBrawlStarsBattles(P1);
    expect(records).toHaveLength(1);
    expect(records[0]!.mode).toBe("gemgrab");
    expect(records[0]!.winnerTag).toBe(P1); // "victory" from requester's view
    expect(records[0]!.player2Tag).toBe(P2);
  });
});

describe("normalizeGameMode", () => {
  it("makes rule modes and parser modes comparable regardless of casing style", () => {
    // The production bug: rules store "gemGrab", the old parser emitted
    // "gem-grab", and a raw lowercase comparison never matched.
    expect(normalizeGameMode("gemGrab")).toBe(normalizeGameMode("gem-grab"));
    expect(normalizeGameMode("Gem Grab")).toBe("gemgrab");
    expect(normalizeGameMode("soloShowdown")).toBe("soloshowdown");
    expect(normalizeGameMode("brawlBall")).toBe(normalizeGameMode("brawl-ball"));
    expect(normalizeGameMode(undefined)).toBe("unknown");
    expect(normalizeGameMode("---")).toBe("unknown");
  });
});
