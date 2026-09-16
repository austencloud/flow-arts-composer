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
import {
  createCanonicalPlacementContext,
  rotatePlacementAngleToDisplayed,
  rotatePlacementVectorToDisplayed,
  rotateScreenVectorToCanonical,
} from "$lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame";
import { ArrowAdjustmentCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator";
import { directionalTupleProcessor } from "$lib/shared/pictograph/arrow/positioning/calculation/services/directional-tuple-processor";
import { screenSpaceAdjustmentTransformer } from "$lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer";
import { computeSpecialOverrideKey } from "$lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key";
import { GlobalAdjustmentKeyGenerator } from "$lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-key-generator";
import { turnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import { derivePropGeometryKey } from "$lib/shared/pictograph/arrow/positioning/prop-geometry/domain/prop-geometry-key-deriver";
import { PlacementFrame } from "$lib/shared/pictograph/arrow/positioning/placement/domain/placement-frame";

const CANONICAL_SPECIAL = { x: 38, y: -71 };

function rotateMotionToBox(motion: MotionData): MotionData {
  return {
    ...motion,
    gridMode: GridMode.BOX,
    startLocation: rotateLocation(motion.startLocation, 1) as GridLocation,
    endLocation: rotateLocation(motion.endLocation, 1) as GridLocation,
    arrowLocation: rotateLocation(motion.arrowLocation, 1) as GridLocation,
  };
}

function makePair(): {
  diamond: PictographData;
  box: PictographData;
  diamondLeft: MotionData;
  boxLeft: MotionData;
} {
  const diamondLeft = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    arrowLocation: GridLocation.SOUTHWEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 1,
    hand: HandSide.LEFT,
    gridMode: GridMode.DIAMOND,
  });
  const diamondRight = createMotionData({
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    arrowLocation: GridLocation.NORTHEAST,
    startOrientation: Orientation.OUT,
    endOrientation: Orientation.IN,
    turns: 0,
    hand: HandSide.RIGHT,
    gridMode: GridMode.DIAMOND,
  });
  const boxLeft = rotateMotionToBox(diamondLeft);
  const boxRight = rotateMotionToBox(diamondRight);

  return {
    diamondLeft,
    boxLeft,
    diamond: {
      id: "canonical-a",
      letter: "A" as never,
      endPlacement: GridPlacement.GAMMA1,
      gridMode: GridMode.DIAMOND,
      motions: { left: diamondLeft, right: diamondRight },
    },
    box: {
      id: "box-a",
      letter: "A" as never,
      endPlacement: GridPlacement.GAMMA2,
      gridMode: GridMode.BOX,
      motions: { left: boxLeft, right: boxRight },
    },
  };
}

describe("canonical diamond placement frame", () => {
  it("maps every box perimeter location back one exact 45-degree step", () => {
    const { box, boxLeft } = makePair();
    const perimeter = [
      GridLocation.NORTH,
      GridLocation.NORTHEAST,
      GridLocation.EAST,
      GridLocation.SOUTHEAST,
      GridLocation.SOUTH,
      GridLocation.SOUTHWEST,
      GridLocation.WEST,
      GridLocation.NORTHWEST,
    ];

    for (const location of perimeter) {
      const frame = createCanonicalPlacementContext(box, boxLeft, location);
      expect(frame.location).toBe(rotateLocation(location, -1));
      expect(rotateLocation(frame.location!, 1)).toBe(location);
      expect(frame.motionData.gridMode).toBe(GridMode.DIAMOND);
    }
  });

  it("preserves vector magnitude through the box presentation rotation", () => {
    const vector = { x: 113.25, y: -47.5 };
    const rotated = rotatePlacementVectorToDisplayed(vector, 45);
    expect(Math.hypot(rotated.x, rotated.y)).toBeCloseTo(
      Math.hypot(vector.x, vector.y),
      10
    );
  });

  it("rotates canonical glyph angles into the displayed grid", () => {
    expect(rotatePlacementAngleToDisplayed(315, 45)).toBe(0);
    expect(rotatePlacementAngleToDisplayed(0, 45)).toBe(45);
    expect(rotatePlacementAngleToDisplayed(270, 0)).toBe(270);
  });

  it("leaves diamond and non-rotational modes untouched", () => {
    const { diamond, diamondLeft } = makePair();
    const frame = createCanonicalPlacementContext(
      diamond,
      diamondLeft,
      GridLocation.SOUTHWEST
    );
    expect(frame.rotationDegrees).toBe(0);
    expect(frame.pictographData).toBe(diamond);
    expect(frame.motionData).toBe(diamondLeft);
    expect(frame.location).toBe(GridLocation.SOUTHWEST);
  });

  it("runs the entire box tier cascade in diamond and rotates only its final screen vector", async () => {
    const { box, boxLeft, diamondLeft } = makePair();
    const defaultGridModes: string[] = [];
    const specialPlacer = {
      getSpecialJsonAdjustmentOnly: vi.fn(async (motion: MotionData) => {
        expect(motion.gridMode).toBe(GridMode.DIAMOND);
        return {
          adjustment: CANONICAL_SPECIAL,
          filePath: "diamond/special/from_layer1/A_placements.json",
          turnsTupleKey: "(1, 0)",
        };
      }),
      getSpecialAdjustment: vi.fn(async (motion: MotionData) => {
        expect(motion.gridMode).toBe(GridMode.DIAMOND);
        return CANONICAL_SPECIAL;
      }),
    };
    const defaultPlacer = {
      getAvailablePlacementKeys: vi.fn(
        async (_motionType: string, gridMode: string) => {
          defaultGridModes.push(gridMode);
          return ["pro"];
        }
      ),
      getDefaultAdjustment: vi.fn(async () => ({ x: 0, y: 0 })),
    };
    const calculator = new ArrowAdjustmentCalculator(
      specialPlacer as never,
      defaultPlacer as never,
      directionalTupleProcessor
    );

    const boxLocation = boxLeft.arrowLocation;
    const diagnostics = await calculator.getDiagnostics(
      box,
      boxLeft,
      "A",
      boxLocation,
      HandSide.LEFT
    );
    const canonicalLocation = rotateLocation(boxLocation, -1) as GridLocation;
    const canonicalFinal = directionalTupleProcessor.processDirectionalTuples(
      new Point(CANONICAL_SPECIAL.x, CANONICAL_SPECIAL.y),
      diamondLeft,
      canonicalLocation
    );
    const expected = rotatePlacementVectorToDisplayed(canonicalFinal, 45);

    expect(diagnostics.activeTier).toBe("special-json");
    expect(diagnostics.baseAdjustment).toEqual(CANONICAL_SPECIAL);
    expect(diagnostics.finalAdjustment.x).toBeCloseTo(expected.x, 10);
    expect(diagnostics.finalAdjustment.y).toBeCloseTo(expected.y, 10);
    expect(diagnostics.default?.placementFrame).toBe(PlacementFrame.CANONICAL);
    expect(defaultGridModes.length).toBeGreaterThan(0);
    expect(defaultGridModes.every((mode) => mode === GridMode.DIAMOND)).toBe(
      true
    );
  });

  it("gives equivalent Box and Diamond arrows the same persisted identities", () => {
    const { box, boxLeft, diamond, diamondLeft } = makePair();
    const boxSpecialKey = computeSpecialOverrideKey(
      box,
      boxLeft,
      HandSide.LEFT
    );
    const diamondSpecialKey = computeSpecialOverrideKey(
      diamond,
      diamondLeft,
      HandSide.LEFT
    );
    const keyGenerator = new GlobalAdjustmentKeyGenerator(turnsTupleGenerator);
    const boxGlobalKey = keyGenerator.generateKey(
      boxLeft,
      box,
      HandSide.LEFT
    );
    const diamondGlobalKey = keyGenerator.generateKey(
      diamondLeft,
      diamond,
      HandSide.LEFT
    );
    const boxPropGeometryKey = derivePropGeometryKey(
      box,
      boxLeft,
      HandSide.LEFT
    );
    const diamondPropGeometryKey = derivePropGeometryKey(
      diamond,
      diamondLeft,
      HandSide.LEFT
    );

    expect(boxSpecialKey).toBe(diamondSpecialKey);
    expect(boxSpecialKey.startsWith("canonical|")).toBe(true);
    expect(boxGlobalKey).toEqual(diamondGlobalKey);
    expect(boxGlobalKey.placementFrame).toBe(PlacementFrame.CANONICAL);
    expect(boxPropGeometryKey).toEqual(diamondPropGeometryKey);
    expect(boxPropGeometryKey?.placementFrame).toBe(PlacementFrame.CANONICAL);
  });

  it("uses one canonical identity for every rotational display grid", () => {
    const { box, boxLeft } = makePair();
    const specialKey = computeSpecialOverrideKey(
      box,
      boxLeft,
      HandSide.LEFT
    );
    const globalKey = new GlobalAdjustmentKeyGenerator(
      turnsTupleGenerator
    ).generateKey(boxLeft, box, HandSide.LEFT);
    const propGeometryKey = derivePropGeometryKey(
      box,
      boxLeft,
      HandSide.LEFT
    );

    expect(specialKey.startsWith("canonical|")).toBe(true);
    expect(globalKey.placementFrame).toBe(PlacementFrame.CANONICAL);
    expect(propGeometryKey?.placementFrame).toBe(PlacementFrame.CANONICAL);
  });

  it("round-trips a box WASD screen delta through the canonical tuple inverse", () => {
    const { box, boxLeft } = makePair();
    const frame = createCanonicalPlacementContext(
      box,
      boxLeft,
      boxLeft.arrowLocation
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
    const renderedCanonical =
      directionalTupleProcessor.processDirectionalTuples(
        reference,
        frame.motionData,
        frame.location!
      );
    const renderedBox = rotatePlacementVectorToDisplayed(
      renderedCanonical,
      frame.rotationDegrees
    );

    expect(renderedBox.x).toBeCloseTo(requested.x, 0);
    expect(renderedBox.y).toBeCloseTo(requested.y, 0);
  });
});
