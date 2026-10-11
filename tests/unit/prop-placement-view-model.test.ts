import { describe, expect, it } from "vitest";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  buildPlacementPictographData,
  buildPlacementPrompt,
  calculatePlacementBetaOffsets,
  computeGammaGuideArc,
  getPlacementGuideCoordinates,
} from "#lib/shared/pictograph/grid/services/prop-placement-view-model.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("prop placement view model", () => {
  it("selects the prompt for placement, hover, live aiming, and completion", () => {
    const base = {
      disabled: false,
      isComplete: false,
      canAim: true,
      activeHand: HandSide.LEFT as HandSide | null,
      dragHand: null as HandSide | null,
      dragAim: null as Orientation | null,
      hoverHand: null as HandSide | null,
      leftLocation: null,
      rightLocation: null,
      leftNoun: "left prop",
      rightNoun: "right prop",
    };

    expect(buildPlacementPrompt(base).text).toBe(
      "Press a point and drag to aim the left prop"
    );
    expect(
      buildPlacementPrompt({
        ...base,
        activeHand: null,
        hoverHand: HandSide.RIGHT,
      }).text
    ).toBe("Drag to aim the right prop");
    expect(
      buildPlacementPrompt({
        ...base,
        dragHand: HandSide.LEFT,
        dragAim: Orientation.COUNTER,
      }).text
    ).toBe("Aiming the left prop: Counter");
    expect(
      buildPlacementPrompt({
        ...base,
        isComplete: true,
        activeHand: null,
      }).text
    ).toBe("Drag a prop to aim it");
  });

  it("builds live placement motions without losing preview notation", () => {
    const result = buildPlacementPictographData({
      gridMode: GridMode.DIAMOND,
      leftLocation: GridLocation.NORTH,
      rightLocation: GridLocation.SOUTH,
      leftOrientation: Orientation.IN,
      rightOrientation: Orientation.OUT,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      betaSwapped: false,
      previewPictographData: {
        id: "preview-id",
        letter: "A",
      } as never,
    });

    expect(result.id).toBe("preview-id");
    expect(result.letter).toBe("A");
    expect(result.motions[HandSide.LEFT]?.startLocation).toBe(
      GridLocation.NORTH
    );
    expect(result.motions[HandSide.RIGHT]?.endOrientation).toBe(
      Orientation.OUT
    );
  });

  it("mirrors the canonical beta offsets when the pair is swapped", () => {
    const input = {
      gridMode: GridMode.DIAMOND,
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.EAST,
      leftOrientation: Orientation.IN,
      rightOrientation: Orientation.IN,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
    };
    const normal = calculatePlacementBetaOffsets({
      ...input,
      betaSwapped: false,
    });
    const swapped = calculatePlacementBetaOffsets({
      ...input,
      betaSwapped: true,
    });

    expect(swapped.left.x).toBeCloseTo(-normal.left.x);
    expect(swapped.left.y).toBeCloseTo(-normal.left.y);
    expect(swapped.right.x).toBeCloseTo(-normal.right.x);
    expect(swapped.right.y).toBeCloseTo(-normal.right.y);
  });

  it("derives guide coordinates and the gamma arc from canonical grid points", () => {
    const coordinates = getPlacementGuideCoordinates({
      left: GridLocation.NORTH,
      right: GridLocation.EAST,
    });

    expect(coordinates?.left.location).toBe(GridLocation.NORTH);
    expect(coordinates?.right.location).toBe(GridLocation.EAST);
    expect(computeGammaGuideArc(coordinates)).toMatch(/^M .+ A 60 60 /);
    expect(computeGammaGuideArc(null)).toBe("");
  });
});
