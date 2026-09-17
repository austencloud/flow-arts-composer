import { describe, expect, it } from "vitest";
import { createFuseRule } from "$lib/features/fuse/domain/fuse-rule";
import {
  buildFuseRecipeSummaries,
  type FuseRecipeSummaryInput,
} from "$lib/features/fuse/domain/fuse-recipe-summaries";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

function recipe(
  overrides: Partial<FuseRecipeSummaryInput> = {}
): FuseRecipeSummaryInput {
  return {
    requestedLength: 8,
    generationLevel: 1,
    maxTurnIntensity: 0,
    gridMode: GridMode.DIAMOND,
    constraintPreset: "smooth",
    handPathMode: "mixed",
    motionTypeFilter: null,
    startLocation: null,
    startOrientation: null,
    traversalDirection: null,
    mode: "shuffle",
    driverSide: "blue",
    rule: createFuseRule({ reflect: "mirror" }),
    ...overrides,
  };
}

describe("Fuse recipe summaries", () => {
  it("keeps the six header and drawer values concise at their defaults", () => {
    expect(buildFuseRecipeSummaries(recipe())).toEqual({
      length: "8 steps",
      level: "Level 1 · no turns",
      grid: "Diamond",
      style: "Default",
      starting: "Random",
      pairing: "Separate",
    });
  });

  it("folds max turns into Level and describes a linked relationship", () => {
    const summaries = buildFuseRecipeSummaries(
      recipe({
        generationLevel: 3,
        maxTurnIntensity: 1.5,
        mode: "symmetry",
        driverSide: "red",
        rule: createFuseRule({ reflect: "mirror", invert: true }),
      })
    );

    expect(summaries.level).toBe("Level 3 · ≤1.5 turns");
    expect(summaries.pairing).toBe("Right → Together, opposite → Left");
  });

  it("names non-default style and starting-condition choices", () => {
    const summaries = buildFuseRecipeSummaries(
      recipe({
        constraintPreset: "mixed",
        handPathMode: "choppy",
        motionTypeFilter: "prefer-dash",
        startLocation: GridLocation.NORTHEAST,
        startOrientation: Orientation.OUT,
        traversalDirection: "counterclockwise",
      })
    );

    expect(summaries.style).toBe("Props: Mixed · Hands: Choppy · Dashes: High");
    expect(summaries.starting).toBe("Northeast · Out · CCW");
  });
});
