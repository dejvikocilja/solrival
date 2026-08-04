import { describe, it, expect } from "vitest";
import { readModeAliases } from "./mode-aliases";

/**
 * `verificationConfig` is untyped JSON written by seeds and (eventually)
 * admins. A malformed value must degrade to "canonical mode only" and never
 * throw — an exception here would stall verification for duels holding real
 * stakes, which is strictly worse than ignoring a bad alias list.
 */
describe("readModeAliases", () => {
  it("reads a well-formed alias array", () => {
    expect(readModeAliases({ gameMode: ["Draft", "Draft_Ladder"] })).toEqual([
      "Draft",
      "Draft_Ladder",
    ]);
  });

  it("returns none when the key is missing", () => {
    expect(readModeAliases({ type: "friendly" })).toEqual([]);
  });

  it("returns none for a non-array gameMode (the Brawl Stars rules use a string)", () => {
    expect(readModeAliases({ gameMode: "knockout" })).toEqual([]);
  });

  it("drops non-string and blank entries instead of trusting them", () => {
    expect(readModeAliases({ gameMode: ["Draft", 42, null, "", "  ", "Ladder"] })).toEqual([
      "Draft",
      "Ladder",
    ]);
  });

  it("tolerates null, undefined and primitives without throwing", () => {
    expect(readModeAliases(null)).toEqual([]);
    expect(readModeAliases(undefined)).toEqual([]);
    expect(readModeAliases("nonsense")).toEqual([]);
    expect(readModeAliases(7)).toEqual([]);
  });
});
