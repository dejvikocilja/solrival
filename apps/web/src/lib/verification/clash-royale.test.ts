import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Clash Royale mode-extraction tests.
 *
 * These pin the fix for a bug that made EVERY Clash Royale duel unverifiable:
 * the parser reported the battle TYPE ("PvP", "friendly") as the record's
 * `mode`, while every duel rule stores a game-mode name ("Draft",
 * "TripleDraft"). The engine compares those two values, so the match could
 * never succeed and no CR duel could ever settle.
 *
 * The fixtures use the shape of the real Clash Royale battlelog response.
 */

vi.mock("./supercell-client", () => ({
  supercellGet: vi.fn(),
  encodePlayerTag: (t: string) => encodeURIComponent(t),
  SupercellApiError: class SupercellApiError extends Error {},
}));

import { fetchClashRoyaleBattles } from "./clash-royale";
import { supercellGet } from "./supercell-client";

const P1 = "#ABC123";
const P2 = "#XYZ789";

function battle(over: Record<string, unknown> = {}) {
  return {
    type: "friendly",
    battleTime: "20260801T120000.000Z",
    gameMode: { id: 72000006, name: "Draft_Ladder" },
    team: [{ tag: P1, crowns: 3 }],
    opponent: [{ tag: P2, crowns: 1 }],
    ...over,
  };
}

describe("fetchClashRoyaleBattles — mode extraction", () => {
  beforeEach(() => vi.mocked(supercellGet).mockReset());

  it("reports the game mode name, not the battle type", async () => {
    vi.mocked(supercellGet).mockResolvedValue([battle()]);
    const [rec] = await fetchClashRoyaleBattles(P1);
    // Before the fix this was "friendly" (the battle type) and never matched.
    expect(rec!.mode).toBe("Draft_Ladder");
  });

  it("falls back to the battle type when gameMode is absent", async () => {
    vi.mocked(supercellGet).mockResolvedValue([battle({ gameMode: undefined })]);
    const [rec] = await fetchClashRoyaleBattles(P1);
    expect(rec!.mode).toBe("friendly");
  });

  it("falls back when gameMode.name is blank rather than emitting empty", async () => {
    vi.mocked(supercellGet).mockResolvedValue([battle({ gameMode: { name: "   " } })]);
    const [rec] = await fetchClashRoyaleBattles(P1);
    expect(rec!.mode).toBe("friendly");
  });

  it("still extracts both tags and the crown winner", async () => {
    vi.mocked(supercellGet).mockResolvedValue([battle()]);
    const [rec] = await fetchClashRoyaleBattles(P1);
    expect(rec!.winnerTag?.toUpperCase()).toContain("ABC123");
    expect(rec!.gameId).toBe("clash-royale");
  });
});
