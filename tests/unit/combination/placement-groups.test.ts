import { describe, it, expect } from "vitest";
import {
  placementGroup,
  seamOf,
  seamEndOf,
} from "$lib/shared/combination/services/placement-groups";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  GridPlacement,
  GridPlacementGroup,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

describe("placementGroup", () => {
  it("extracts the family from a GridPlacement", () => {
    expect(placementGroup(GridPlacement.ALPHA3)).toBe(GridPlacementGroup.ALPHA);
    expect(placementGroup(GridPlacement.BETA5)).toBe(GridPlacementGroup.BETA);
    expect(placementGroup("gamma11" as GridPlacement)).toBe(
      GridPlacementGroup.GAMMA
    );
    expect(placementGroup("terra1")).toBe(GridPlacementGroup.TERRA);
    expect(placementGroup("eta5")).toBe(GridPlacementGroup.ETA);
    expect(placementGroup("tau9")).toBe(GridPlacementGroup.TAU);
    expect(placementGroup("zeta16")).toBe(GridPlacementGroup.ZETA);
  });

  it("returns null for unknown strings", () => {
    expect(placementGroup("nonsense9")).toBeNull();
  });

  it("returns null for a bare group name with no trailing digits", () => {
    expect(placementGroup("alpha")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(placementGroup("")).toBeNull();
  });

  it("rejects uppercase (case-sensitive by design)", () => {
    expect(placementGroup("Alpha3")).toBeNull();
  });
});

describe("seamOf / seamEndOf", () => {
  it("reads startPlacement and endPlacement off a step", () => {
    const step = {
      startPlacement: "beta5",
      endPlacement: null,
    } as StepData;

    expect(seamOf(step)).toBe("beta5");
    expect(seamEndOf(step)).toBeNull();
  });
});
