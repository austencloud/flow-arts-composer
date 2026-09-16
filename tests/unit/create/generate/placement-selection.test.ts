import { describe, expect, it } from "vitest";
import {
  blockAllExcept,
  hasSameBlockedPlacements,
  toggleBlockedPlacement,
} from "$lib/shared/components/placement-picker/placement-selection";
import { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

const placements = [
  GridPlacement.ALPHA1,
  GridPlacement.ALPHA3,
  GridPlacement.BETA1,
];

describe("placement picker selection", () => {
  it("keeps the final enabled placement selected", () => {
    const blocked = [GridPlacement.ALPHA3, GridPlacement.BETA1];

    expect(toggleBlockedPlacement(placements, blocked, GridPlacement.ALPHA1)).toBe(
      blocked
    );
  });

  it("toggles placements while more than one remains available", () => {
    expect(toggleBlockedPlacement(placements, [], GridPlacement.ALPHA1)).toEqual([
      GridPlacement.ALPHA1,
    ]);
    expect(
      toggleBlockedPlacement(
        placements,
        [GridPlacement.ALPHA1],
        GridPlacement.ALPHA1
      )
    ).toEqual([]);
  });

  it("turns a choose-one tap into one enabled placement", () => {
    expect(blockAllExcept(placements, GridPlacement.ALPHA3)).toEqual([
      GridPlacement.ALPHA1,
      GridPlacement.BETA1,
    ]);
  });

  it("matches preset blocklists without depending on order", () => {
    expect(
      hasSameBlockedPlacements(
        [GridPlacement.BETA1, GridPlacement.ALPHA1],
        [GridPlacement.ALPHA1, GridPlacement.BETA1]
      )
    ).toBe(true);
  });
});
