import { describe, expect, it } from "vitest";
import { GridPlacement, GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PlacementAnalyzer } from "../placement-analyzer";

const analyzer = new PlacementAnalyzer();

describe("getEndPlacementGroup", () => {
  it("groups every placement family", () => {
    expect(analyzer.getEndPlacementGroup(GridPlacement.ALPHA1)).toBe(GridPlacementGroup.ALPHA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.BETA3)).toBe(GridPlacementGroup.BETA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.GAMMA9)).toBe(GridPlacementGroup.GAMMA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.ZETA10)).toBe(GridPlacementGroup.ZETA);
    expect(analyzer.getEndPlacementGroup(GridPlacement.ETA2)).toBe(GridPlacementGroup.ETA);
    expect(analyzer.getEndPlacementGroup(null)).toBeNull();
  });
});

describe("getRotationRelation", () => {
  it("treats zeta and eta as 16-slot groups like gamma", () => {
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ZETA1)).toBe("exact");
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ZETA5)).toBe("quarter");
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ZETA9)).toBe("half");
    expect(analyzer.getRotationRelation(GridPlacement.ETA2, GridPlacement.ETA10)).toBe("half");
    expect(analyzer.getRotationRelation(GridPlacement.ZETA1, GridPlacement.ETA1)).toBeNull();
  });
});
