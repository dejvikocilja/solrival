import { describe, it, expect } from "vitest";
import {
  ruleTemplateSchema,
  RULES_BY_GAME,
  UNAVAILABLE_TEMPLATES,
  type RuleTemplate,
} from "./schemas";

/**
 * Rule templates are declared in three places that must agree:
 *
 *   1. `ruleTemplateSchema`  — what the API will accept
 *   2. `RULES_BY_GAME`       — what the create-duel form offers
 *   3. the `RuleTemplate` DB enum + a `duel_rules` row
 *
 * Adding a mode to the database and the schema but forgetting `RULES_BY_GAME`
 * makes the mode simply not appear in the product, with nothing failing
 * anywhere — exactly how the first four Brawl Stars modes shipped invisible.
 * These tests turn that silent omission into a failing build.
 *
 * (Presentation copy in `RULE_META` is already covered by the compiler: it is
 * a `Record<RuleTemplate, …>`, so a missing entry is a type error.)
 */
describe("rule template registries stay in sync", () => {
  const declared = ruleTemplateSchema.options as readonly RuleTemplate[];
  const offered = Object.values(RULES_BY_GAME).flat();

  it("accounts for every declared template — either offered, or explicitly withheld", () => {
    // Equality (not subset) on purpose: a new template that is neither offered
    // nor listed as unavailable is almost certainly one someone forgot to wire
    // up, which is how four Brawl Stars modes once shipped invisible.
    expect([...offered, ...UNAVAILABLE_TEMPLATES].sort()).toEqual([...declared].sort());
  });

  it("never offers a template that is also marked unavailable", () => {
    for (const t of UNAVAILABLE_TEMPLATES) expect(offered).not.toContain(t);
  });

  it("assigns each template to the game its prefix implies", () => {
    for (const t of RULES_BY_GAME.CLASH_ROYALE) expect(t.startsWith("CR_")).toBe(true);
    for (const t of RULES_BY_GAME.BRAWL_STARS) expect(t.startsWith("BS_")).toBe(true);
  });

  it("lists no template twice", () => {
    expect(new Set(offered).size).toBe(offered.length);
  });
});
