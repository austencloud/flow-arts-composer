import { Point } from "fabric";
import { describe, expect, it, vi } from "vitest";

import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { calculateArrowPoint } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
import { getInitialPosition } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-grid-coordinator";
import {
  createCanonicalPlacementContext,
  rotatePlacementVectorToDisplayed,
  rotateScreenVectorToCanonical,
} from "$lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame";
import { directionalTupleProcessor } from "$lib/shared/pictograph/arrow/positioning/calculation/services/directional-tuple-processor";
import { screenSpaceAdjustmentTransformer } from "$lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer";
import { computeSpecialOverrideKey } from "$lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key";
import { GlobalAdjustmentKeyGenerator } from "$lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-key-generator";
import { turnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import { derivePropGeometryKey } from "$lib/shared/pictograph/arrow/positioning/prop-geometry/domain/prop-geometry-key-deriver";
import { PlacementFrame } from "$lib/shared/pictograph/arrow/positioning/placement/domain/placement-frame";

// Serve the real default placement tables and nothing else, so each arrow
// here lands where its default adjustment puts it: the layer Box and Diamond
// use when no letter-specific placement exists.
vi.mock("$lib/shared/net/asset-fetch", async () => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  return {
    assetFetch: vi.fn(async (url: string) => {
      const body = url.includes("/arrow_placement/default/")
        ? await readFile(path.join(process.cwd(), "static", url), "utf8")
        : "{}";
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  };
});

interface HandMove {
  type: MotionType;
  start: GridLocation;
  end: GridLocation;
  endOrientation: Orientation;
}

function hand(side: HandSide, gridMode: GridMode, move: HandMove): MotionData {
  return createMotionData({
    hand: side,
    gridMode,
    motionType: move.type,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: move.start,
    endLocation: move.end,
    startOrientation: Orientation.IN,
    endOrientation: move.endOrientation,
    turns: 0,
  });
}

function turned(move: HandMove, steps: number): HandMove {
  return {
    ...move,
    start: rotateLocation(move.start, steps) as GridLocation,
    end: rotateLocation(move.end, steps) as GridLocation,
  };
}

// Beat O2-11 of the skewed frame. Blue stays on the diamond points (E to S);
// red stays on the box points (NW to SW) and used to sit on top of its staff.
const BLUE: HandMove = {
  type: MotionType.PRO,
  start: GridLocation.EAST,
  end: GridLocation.SOUTH,
  endOrientation: Orientation.IN,
};
const RED: HandMove = {
  type: MotionType.ANTI,
  start: GridLocation.NORTHWEST,
  end: GridLocation.SOUTHWEST,
  endOrientation: Orientation.OUT,
};

// Rows from the skewed CSV carry no pictograph grid mode; the renderer
// derives Skewed from the two hands and passes it along.
const skewed: PictographData = {
  id: "O2-11",
  letter: "O" as never,
  endPlacement: GridPlacement.ETA6,
  motions: {
    left: hand(HandSide.LEFT, GridMode.SKEWED, BLUE),
    right: hand(HandSide.RIGHT, GridMode.SKEWED, RED),
  },
};
// The same red hand in a Box beat, and the same blue hand in a Diamond beat.
const boxTwin: PictographData = {
  id: "O-box",
  letter: "O" as never,
  endPlacement: GridPlacement.BETA2,
  gridMode: GridMode.BOX,
  motions: {
    left: hand(HandSide.LEFT, GridMode.BOX, turned(BLUE, 1)),
    right: hand(HandSide.RIGHT, GridMode.BOX, RED),
  },
};
const diamondTwin: PictographData = {
  id: "O-diamond",
  letter: "O" as never,
  endPlacement: GridPlacement.BETA5,
  gridMode: GridMode.DIAMOND,
  motions: {
    left: hand(HandSide.LEFT, GridMode.DIAMOND, BLUE),
    right: hand(HandSide.RIGHT, GridMode.DIAMOND, turned(RED, -1)),
  },
};

function expectSamePlacement(
  actual: [number, number, number],
  expected: [number, number, number]
): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

describe("skewed beats place a one-grid arrow the way its own grid does", () => {
  it("puts an arrow on the box points exactly where Box puts it", async () => {
    const red = skewed.motions.right!;
    const placed = await calculateArrowPoint(skewed, red, GridMode.SKEWED);
    const inBox = await calculateArrowPoint(
      boxTwin,
      boxTwin.motions.right!,
      GridMode.BOX
    );

    expectSamePlacement(placed, inBox);
    // The default adjustment moved it off the bare anchor, so this compares
    // placed arrows, not two unadjusted starting points.
    const anchor = getInitialPosition(red, GridLocation.WEST, GridMode.BOX);
    expect(Math.hypot(placed[0] - anchor.x, placed[1] - anchor.y)).toBeGreaterThan(
      10
    );
  });

  it("puts an arrow on the diamond points exactly where Diamond puts it", async () => {
    const placed = await calculateArrowPoint(
      skewed,
      skewed.motions.left!,
      GridMode.SKEWED
    );
    const inDiamond = await calculateArrowPoint(
      diamondTwin,
      diamondTwin.motions.left!,
      GridMode.DIAMOND
    );

    expectSamePlacement(placed, inDiamond);
  });

  it("keeps looking up saved skewed placements under the skewed frame", () => {
    const red = skewed.motions.right!;
    const specialKey = computeSpecialOverrideKey(skewed, red, HandSide.RIGHT);
    const globalKey = new GlobalAdjustmentKeyGenerator(
      turnsTupleGenerator
    ).generateKey(red, skewed, HandSide.RIGHT);
    const propGeometryKey = derivePropGeometryKey(skewed, red, HandSide.RIGHT);

    expect(specialKey.startsWith(`${PlacementFrame.SKEWED}|`)).toBe(true);
    expect(globalKey.placementFrame).toBe(PlacementFrame.SKEWED);
    expect(propGeometryKey?.placementFrame).toBe(PlacementFrame.SKEWED);
  });

  it("leaves an arrow that crosses between the grids on the skewed path", () => {
    const crossing = hand(HandSide.RIGHT, GridMode.SKEWED, {
      type: MotionType.PRO,
      start: GridLocation.WEST,
      end: GridLocation.NORTHEAST,
      endOrientation: Orientation.OUT,
    });
    const beat: PictographData = {
      ...skewed,
      motions: { left: skewed.motions.left, right: crossing },
    };
    const frame = createCanonicalPlacementContext(
      beat,
      crossing,
      GridLocation.NORTH,
      GridMode.SKEWED
    );

    expect(frame.rotationDegrees).toBe(0);
    expect(frame.pictographData).toBe(beat);
    expect(frame.motionData).toBe(crossing);
    expect(frame.location).toBe(GridLocation.NORTH);
  });

  it("moves a nudged box-point arrow as far as the arrow editor asked", () => {
    const red = skewed.motions.right!;
    const frame = createCanonicalPlacementContext(
      skewed,
      red,
      GridLocation.WEST,
      GridMode.SKEWED
    );
    const requested = { x: 0, y: -20 };
    const canonicalScreen = rotateScreenVectorToCanonical(
      requested,
      frame.rotationDegrees
    );
    const reference = screenSpaceAdjustmentTransformer.transformToReference(
      new Point(canonicalScreen.x, canonicalScreen.y),
      frame.motionData,
      frame.location!
    );
    const rendered = rotatePlacementVectorToDisplayed(
      directionalTupleProcessor.processDirectionalTuples(
        reference,
        frame.motionData,
        frame.location!
      ),
      frame.rotationDegrees
    );

    // Saved nudges are whole pixels, so after the 45° turn the arrow can land
    // up to a fraction of a pixel off, exactly as it does in Box.
    expect(rendered.x).toBeCloseTo(requested.x, 0);
    expect(rendered.y).toBeCloseTo(requested.y, 0);
  });
});
