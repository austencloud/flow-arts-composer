// tests/generation/turns/left-spin-rule.test.ts
import { describe, expect, it } from "vitest";
import { resolveLeftSpinRule } from "../../../src/generation/turns/left-spin-rule.js";

describe("resolveLeftSpinRule", () => {
  it("is undefined with nothing to relate", () => {
    expect(resolveLeftSpinRule({})).toBeUndefined();
    expect(
      resolveLeftSpinRule({ handRelationship: { map: "reflect-north-south" } })
    ).toBeUndefined();
    expect(resolveLeftSpinRule({ matchHandTurns: true })).toBeUndefined();
  });

  it("follows the hand relationship under match turns", () => {
    const rule = resolveLeftSpinRule({
      handRelationship: { map: "reflect-north-south" },
      matchHandTurns: true,
    })!;
    expect(rule("cw")).toBe("ccw");
    expect(rule("noRotation")).toBeUndefined();
  });

  it("lets the prop relationship decide, with or without match turns", () => {
    const rule = resolveLeftSpinRule({
      propRelationship: { direction: "same" },
      handRelationship: { map: "reflect-north-south" },
    })!;
    expect(rule("cw")).toBe("cw");
    expect(
      resolveLeftSpinRule({ propRelationship: { direction: "opp" } })!("cw")
    ).toBe("ccw");
  });
});
