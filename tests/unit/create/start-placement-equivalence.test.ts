import { describe, expect, it } from "vitest";
import { areStartPlacementsEquivalent } from "$lib/features/create/construct/start-placement-picker/services/start-placement-equivalence";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

function placement({
  id,
  startPlacement,
  leftLocation = "n",
  leftOrientation = "in",
  rightLocation = "s",
  rightOrientation = "in",
}: {
  id: string;
  startPlacement?: string;
  leftLocation?: string;
  leftOrientation?: string;
  rightLocation?: string;
  rightOrientation?: string;
}): PictographData {
  return {
    id,
    letter: startPlacement ? (startPlacement[0] as never) : null,
    startPlacement: startPlacement as never,
    gridMode: "diamond",
    motions: {
      left: {
        endLocation: leftLocation,
        endOrientation: leftOrientation,
        gridMode: "diamond",
        isVisible: true,
      } as never,
      right: {
        endLocation: rightLocation,
        endOrientation: rightOrientation,
        gridMode: "diamond",
        isVisible: true,
      } as never,
    },
  };
}

describe("start placement equivalence", () => {
  it("ignores object identity and render metadata for a canonical pose", () => {
    expect(
      areStartPlacementsEquivalent(
        placement({ id: "render-a", startPlacement: "gamma15" }),
        placement({ id: "render-b", startPlacement: "gamma15" })
      )
    ).toBe(true);
  });

  it("rejects a different canonical variation", () => {
    expect(
      areStartPlacementsEquivalent(
        placement({ id: "current", startPlacement: "gamma15" }),
        placement({ id: "submitted", startPlacement: "gamma13" })
      )
    ).toBe(false);
  });

  it("compares both hand boundaries for a custom pose", () => {
    const current = placement({ id: "current" });

    expect(
      areStartPlacementsEquivalent(current, placement({ id: "same-pose" }))
    ).toBe(true);
    expect(
      areStartPlacementsEquivalent(
        current,
        placement({ id: "different-pose", rightOrientation: "out" })
      )
    ).toBe(false);
  });
});
