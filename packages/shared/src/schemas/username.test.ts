import { describe, it, expect } from "vitest";
import { usernameSchema, RESERVED_USERNAMES } from "./auth";

describe("usernameSchema", () => {
  it("accepts normal handles", () => {
    for (const name of ["dejvi", "Player_1", "cool-rival", "abc"]) {
      expect(usernameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it("rejects bad length and characters", () => {
    for (const name of ["ab", "a".repeat(21), "has space", "dot.name"]) {
      expect(usernameSchema.safeParse(name).success, name).toBe(false);
    }
  });

  it("rejects reserved names in any casing (impersonation guard)", () => {
    expect(RESERVED_USERNAMES.has("admin")).toBe(true);
    for (const name of ["admin", "ADMIN", "SolRival", "Support", "moderator"]) {
      expect(usernameSchema.safeParse(name).success, name).toBe(false);
    }
  });
});
