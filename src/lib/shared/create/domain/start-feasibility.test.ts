import { describe, expect, it } from "vitest";
import type { PictographData } from "@tka/sequence-engine/generation";
import { assessStartFeasibility } from "./start-feasibility";
import { loadDiamondVariations } from "../../../../../packages/sequence-engine/tests/helpers/csv-variations";

function variation(
  startPlacement: string,
  leftStart: string,
  rightStart: string,
  leftMotionType: "pro" | "anti" = "pro"
): PictographData {
  return {
    letter: "A",
    startPlacement,
    endPlacement: startPlacement,
    timing: "together",
    direction: "opposite",
    leftMotion: {
      startLocation: leftStart,
      endLocation: leftStart,
      motionType: leftMotionType,
      rotationDirection: "ccw",
    } as PictographData["leftMotion"],
    rightMotion: {
      startLocation: rightStart,
      endLocation: rightStart,
      motionType: "pro",
      rotationDirection: "cw",
    } as PictographData["rightMotion"],
  };
}

describe("assessStartFeasibility", () => {
  it("reproduces the reported dead start against production diamond rows", () => {
    const input = {
      variations: loadDiamondVariations(),
      handRelationship: "QO" as const,
      propRelationship: "SO" as const,
      loopAxis: "northeast-southwest" as const,
    };
    const restricted = assessStartFeasibility({
      ...input,
      blockedStartPlacements: [
        "alpha3", "alpha5", "alpha7", "beta1", "beta3", "beta7",
        "gamma1", "gamma3", "gamma5", "gamma7", "gamma9",
        "gamma13", "gamma15",
      ],
    });
    const unrestricted = assessStartFeasibility(input);

    expect(restricted.feasible).toBe(false);
    expect(unrestricted.feasible).toBe(true);
  });

  it("proves an all-blocked QO/SO start impossible before search", () => {
    // The northeast-southwest QO relation sends the right n location to left e.
    // These otherwise-valid rows represent the exact failure class: users have
    // excluded every placement that can begin the requested relation.
    const result = assessStartFeasibility({
      variations: [
        variation("gamma3", "e", "n"),
        variation("gamma7", "e", "n"),
      ],
      handRelationship: "QO",
      propRelationship: "SO",
      loopAxis: "northeast-southwest",
      blockedStartPlacements: ["gamma3", "gamma7"],
    });

    expect(result).toMatchObject({
      feasible: false,
      candidateVariationCount: 0,
      candidateStartPlacements: [],
    });
    expect(result.reason).toContain("No allowed starting placement");
  });

  it("chooses the viable QS sense instead of letting generation roll a blocked one", () => {
    const result = assessStartFeasibility({
      // cw sends n to e; ccw sends n to w. The ccw-only start is blocked.
      variations: [
        variation("gamma11", "e", "n", "anti"),
        variation("gamma1", "w", "n", "anti"),
      ],
      handRelationship: "QS",
      propRelationship: "TO",
      blockedStartPlacements: ["gamma1"],
    });

    expect(result.feasible).toBe(true);
    expect(result.candidateStartPlacements).toEqual(["gamma11"]);
    expect(result.resolvedHandRelationship).toEqual({
      map: "rotate-90-cw",
      inverted: true,
    });
    expect(result.viableHandRelationships).toEqual([
      { map: "rotate-90-cw", inverted: true },
    ]);
  });

  it("treats a pinned start incompatible with both quarter senses as impossible", () => {
    const result = assessStartFeasibility({
      variations: [variation("alpha1", "w", "e", "anti")],
      handRelationship: "QS",
      propRelationship: "TO",
      startPlacement: "alpha1",
      startLocations: { left: "w", right: "e" },
    });

    expect(result.feasible).toBe(false);
    expect(result.candidateVariationCount).toBe(0);
  });
});
