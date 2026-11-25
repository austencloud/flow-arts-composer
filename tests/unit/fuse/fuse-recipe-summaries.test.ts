import { describe, expect, it } from "vitest";
import { createFuseRule } from "#lib/features/fuse/domain/fuse-rule.js";
import {
  buildFusePairingSummary,
  buildFuseRecipeFacts,
  type FuseRecipeFactsInput,
} from "#lib/features/fuse/domain/fuse-recipe-summaries.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

function recipe(
  overrides: Partial<FuseRecipeFactsInput> = {}
): FuseRecipeFactsInput {
  return {
    requestedLength: 8,
    generationLevel: 1,
    maxTurnIntensity: 1,
    gridMode: GridMode.DIAMOND,
    constraintPreset: "smooth",
    handPathMode: "mixed",
    motionTypeFilter: null,
    startLocation: null,
    startOrientation: null,
    traversalDirection: null,
    ...overrides,
  };
}

function values(input: FuseRecipeFactsInput) {
  const facts = buildFuseRecipeFacts(input);
  return {
    path: facts.path.map((fact) => fact.value),
    style: facts.style.map((fact) => fact.value),
    start: facts.start.map((fact) => fact.value),
  };
}

describe("Fuse recipe facts", () => {
  it("names every setting under the name its row carries", () => {
    const facts = buildFuseRecipeFacts(recipe());
    expect(facts.path.map((fact) => fact.name)).toEqual([
      "Length",
      "Level",
      "Max turns",
      "Grid",
    ]);
    expect(facts.start.map((fact) => fact.name)).toEqual([
      "Start point",
      "Orientation",
      "Travel",
    ]);
  });

  // The saved maximum stays in the recipe at Level 1, where no turn is used.
  it("says no turns at Level 1 whatever maximum is saved", () => {
    expect(values(recipe({ maxTurnIntensity: 3 })).path).toEqual([
      "8",
      "1",
      "None",
      "Diamond",
    ]);
    expect(
      values(recipe({ generationLevel: 3, maxTurnIntensity: 1.5 })).path
    ).toEqual(["8", "3", "1.5", "Diamond"]);
  });

  it("reads an open start as Any and a set one by its short name", () => {
    expect(values(recipe()).start).toEqual(["Any", "Any", "Any"]);
    const set = values(
      recipe({
        gridMode: GridMode.BOX,
        startLocation: GridLocation.NORTHEAST,
        startOrientation: Orientation.OUT,
        traversalDirection: "counterclockwise",
      })
    );
    expect(set.start[0]).toBe("NE");
    expect(set.start[2]).toBe("CCW");
  });

  it("reads an unset dash choice as the mixed one", () => {
    expect(values(recipe()).style[2]).toBe(
      values(recipe({ handPathMode: "mixed" })).style[1]
    );
    expect(values(recipe({ motionTypeFilter: "no-dash" })).style[2]).not.toBe(
      values(recipe()).style[2]
    );
  });
});

describe("Fuse pairing summary", () => {
  it("names a linked relationship by its driver, rule and follower", () => {
    expect(
      buildFusePairingSummary({
        mode: "symmetry",
        driverSide: "right",
        rule: createFuseRule({ reflect: "mirror", invert: true }),
      })
    ).toBe("Right → Together, opposite → Left");
    expect(
      buildFusePairingSummary({
        mode: "shuffle",
        driverSide: "left",
        rule: createFuseRule({ reflect: "mirror" }),
      })
    ).toBe("Separate");
  });
});
