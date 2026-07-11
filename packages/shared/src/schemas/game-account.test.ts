import { describe, it, expect } from "vitest";
import { normalizePlayerTag, linkGameAccountSchema } from "./game-account";

describe("normalizePlayerTag", () => {
  it("canonicalizes case, missing '#', and the classic O→0 typo", () => {
    expect(normalizePlayerTag("2pyl9qgr")).toBe("#2PYL9QGR");
    expect(normalizePlayerTag("#2PYL9QGR")).toBe("#2PYL9QGR");
    expect(normalizePlayerTag("  ##2pyl9qgr  ")).toBe("#2PYL9QGR");
    // Supercell's alphabet has no letter O — players always mean zero.
    expect(normalizePlayerTag("O2O")).toBe("#020");
  });

  it("rejects tags outside the Supercell alphabet or length bounds", () => {
    expect(normalizePlayerTag("AB")).toBeNull(); // too short
    expect(normalizePlayerTag("2PYL9QGR2PYL9QGR")).toBeNull(); // too long
    expect(normalizePlayerTag("HELLO!")).toBeNull(); // punctuation + letters outside the alphabet
    expect(normalizePlayerTag("ABC-123")).toBeNull(); // punctuation
    expect(normalizePlayerTag("")).toBeNull();
  });
});

describe("linkGameAccountSchema", () => {
  it("accepts a valid link matching the game's official host", () => {
    const parsed = linkGameAccountSchema.parse({
      game: "CLASH_ROYALE",
      playerTag: "2pyl9qgr",
      friendLink: "https://link.clashroyale.com/invite/friend/en?tag=2PYL9QGR",
    });
    expect(parsed.playerTag).toBe("#2PYL9QGR");
  });

  it("rejects a link from the wrong game", () => {
    const res = linkGameAccountSchema.safeParse({
      game: "CLASH_ROYALE",
      playerTag: "2pyl9qgr",
      friendLink: "https://link.brawlstars.com/invite/friend/en?tag=X",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an invalid tag with a friendly message", () => {
    const res = linkGameAccountSchema.safeParse({
      game: "BRAWL_STARS",
      playerTag: "not a tag!",
      friendLink: "https://link.brawlstars.com/invite/friend/en?tag=X",
    });
    expect(res.success).toBe(false);
  });
});
