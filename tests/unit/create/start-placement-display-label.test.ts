import { describe, expect, it } from "vitest";
import { getStartPlacementDisplayLabel } from "$lib/features/create/construct/start-placement-picker/services/start-placement-display-label";

describe("start placement display label", () => {
  it("combines the canonical Greek letter and placement number", () => {
    expect(
      getStartPlacementDisplayLabel({
        letter: "α",
        startPlacement: "alpha1",
      } as never)
    ).toBe("α1");
  });

  it("returns null until the placement can be recognized", () => {
    expect(
      getStartPlacementDisplayLabel({
        letter: null,
        startPlacement: null,
      })
    ).toBeNull();
  });
});
