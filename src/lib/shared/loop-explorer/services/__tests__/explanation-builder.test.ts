import { describe, it, expect } from "vitest";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { buildExplanation } from "../explanation-builder";
import type { StepPairRelation } from "../relation-extractor";

describe("buildExplanation", () => {
  it("cites a rotated step pair with the 180° label, never 'turn'", () => {
    const relations: StepPairRelation[] = [
      { stepA: 1, stepB: 9, transform: ["rotated"], rotation: "180" },
    ];

    const explanation = buildExplanation({
      components: new Set([LOOPComponent.ROTATED]),
      slice: "halved",
      relations,
      seedLength: 8,
      totalLength: 16,
    });

    expect(explanation.citations[0]).toBe("Step 9 = step 1 rotated 180°.");
    expect(explanation.citations[0]).not.toMatch(/turn/i);
    expect(explanation.intro).not.toMatch(/turn/i);
    expect(explanation.lengthMath).not.toMatch(/turn/i);
  });

  it("cites a 90° quartered rotation with direction", () => {
    const relations: StepPairRelation[] = [
      { stepA: 1, stepB: 5, transform: ["rotated"], rotation: "90cw" },
    ];

    const explanation = buildExplanation({
      components: new Set([LOOPComponent.ROTATED]),
      slice: "quartered",
      relations,
      seedLength: 4,
      totalLength: 16,
    });

    expect(explanation.citations[0]).toBe("Step 5 = step 1 rotated 90° clockwise.");
    expect(explanation.citations[0]).not.toMatch(/turn/i);
  });

  it("cites a repeated (identity) step pair", () => {
    const relations: StepPairRelation[] = [{ stepA: 1, stepB: 5, transform: [] }];
    const explanation = buildExplanation({
      components: new Set([LOOPComponent.SWAPPED]),
      slice: "halved",
      relations,
      seedLength: 4,
      totalLength: 8,
    });
    expect(explanation.citations[0]).toBe("Step 5 repeats step 1.");
  });

  it("joins multi-component transforms with 'and'", () => {
    const relations: StepPairRelation[] = [
      { stepA: 2, stepB: 10, transform: ["mirrored", "swapped"] },
    ];
    const explanation = buildExplanation({
      components: new Set([LOOPComponent.MIRRORED, LOOPComponent.SWAPPED]),
      slice: "halved",
      relations,
      seedLength: 8,
      totalLength: 16,
    });
    expect(explanation.citations[0]).toBe("Step 10 = step 2 mirrored and swapped.");
  });

  it("computes the length-math line from the wire's expander multiplier", () => {
    // No wire supplied → falls back to totalLength/seedLength rounding.
    const explanation = buildExplanation({
      components: new Set([LOOPComponent.ROTATED]),
      slice: "halved",
      relations: [],
      seedLength: 8,
      totalLength: 16,
    });
    expect(explanation.lengthMath).toBe("8 × 2 = 16 steps.");
  });
});
