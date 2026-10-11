import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  dashClockwiseMap,
  dashCounterClockwiseMap,
  dashClockwiseOverrideMap,
  dashCounterClockwiseOverrideMap,
} from "#lib/shared/pictograph/arrow/positioning/calculation/config/dash-rotation-maps.js";
import { checkAndApplyOverride } from "#lib/shared/pictograph/arrow/positioning/calculation/utils/rotation-override-checker.js";
import type { IRotationAngleOverrideKeyGenerator } from "#lib/shared/pictograph/arrow/positioning/key-generation/services/rotation-angle-override-key-generator.js";
import type { SpecialPlacer } from "#lib/shared/pictograph/arrow/positioning/placement/services/special-placer.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const CLOCKWISE_OVERRIDES = {
  [GridLocation.NORTH]: 270,
  [GridLocation.EAST]: 0,
  [GridLocation.SOUTH]: 90,
  [GridLocation.WEST]: 180,
  [GridLocation.NORTHEAST]: 315,
  [GridLocation.SOUTHEAST]: 45,
  [GridLocation.SOUTHWEST]: 135,
  [GridLocation.NORTHWEST]: 225,
};

/**
 * The counter-clockwise table is the mirror of the clockwise one, not an
 * independent list of numbers -- see the derivation in dash-rotation-maps.ts.
 */
const COUNTERCLOCKWISE_OVERRIDES = {
  [GridLocation.NORTH]: 90,
  [GridLocation.EAST]: 180,
  [GridLocation.SOUTH]: 270,
  [GridLocation.WEST]: 0,
  [GridLocation.NORTHEAST]: 135,
  [GridLocation.SOUTHEAST]: 225,
  [GridLocation.SOUTHWEST]: 315,
  [GridLocation.NORTHWEST]: 45,
};

/** Reflection across the vertical (N-S) axis, which is what scale(-1, 1) does. */
const MIRRORED_ACROSS_VERTICAL_AXIS: Record<string, GridLocation> = {
  [GridLocation.NORTH]: GridLocation.NORTH,
  [GridLocation.SOUTH]: GridLocation.SOUTH,
  [GridLocation.EAST]: GridLocation.WEST,
  [GridLocation.WEST]: GridLocation.EAST,
  [GridLocation.NORTHEAST]: GridLocation.NORTHWEST,
  [GridLocation.NORTHWEST]: GridLocation.NORTHEAST,
  [GridLocation.SOUTHEAST]: GridLocation.SOUTHWEST,
  [GridLocation.SOUTHWEST]: GridLocation.SOUTHEAST,
};

const OVERRIDE_LOCATIONS = Object.keys(
  MIRRORED_ACROSS_VERTICAL_AXIS
) as GridLocation[];

describe("DASH rotation override maps", () => {
  it("quarter-turns a clockwise DASH glyph off its normal angle", () => {
    expect(dashClockwiseOverrideMap).toEqual(CLOCKWISE_OVERRIDES);

    for (const location of OVERRIDE_LOCATIONS) {
      const delta =
        (dashClockwiseOverrideMap[location]! -
          dashClockwiseMap[location] +
          360) %
        360;
      expect({ location, delta }).toEqual({ location, delta: 270 });
    }
  });

  it("mirrors the clockwise table for a counter-clockwise DASH", () => {
    // A counter-clockwise DASH renders with scale(-1, 1), and a horizontal flip
    // reverses rotational sense. Without this, a 1-turn CCW dash at NORTH -- its
    // glyph pointing down -- swung RIGHT on override instead of LEFT.
    expect(dashCounterClockwiseOverrideMap).toEqual(COUNTERCLOCKWISE_OVERRIDES);

    for (const location of OVERRIDE_LOCATIONS) {
      const mirrored = MIRRORED_ACROSS_VERTICAL_AXIS[location];
      expect({
        location,
        angle: dashCounterClockwiseOverrideMap[location],
      }).toEqual({
        location,
        angle: (360 - dashClockwiseOverrideMap[mirrored]!) % 360,
      });
    }
  });

  it("keeps the normal DASH maps on that same mirror identity", () => {
    for (const location of OVERRIDE_LOCATIONS) {
      const mirrored = MIRRORED_ACROSS_VERTICAL_AXIS[location];
      expect({
        location,
        angle: dashCounterClockwiseMap[location],
      }).toEqual({
        location,
        angle: (360 - dashClockwiseMap[mirrored]) % 360,
      });
    }
  });

  it("does not invent a center override for a DASH arrow", () => {
    expect(dashClockwiseOverrideMap[GridLocation.CENTER]).toBeUndefined();
    expect(
      dashCounterClockwiseOverrideMap[GridLocation.CENTER]
    ).toBeUndefined();
  });

  it("keeps the OG straight-line angle when the DASH has no prop rotation", async () => {
    const motion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.DASH,
      turns: 0,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.SOUTH,
      arrowLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
    });
    const specialPlacer = {
      hasRotationAngleOverride: async () => true,
    } as unknown as SpecialPlacer;
    const keyGenerator = {
      generateRotationAngleOverrideKey: () => "dash_rot_angle_override",
    } as unknown as IRotationAngleOverrideKeyGenerator;

    await expect(
      checkAndApplyOverride(
        motion,
        GridLocation.EAST,
        {} as PictographData,
        true,
        specialPlacer,
        keyGenerator
      )
    ).resolves.toBe(90);
  });

  it("swings a 1-turn CCW dash at NORTH clockwise, not counter-clockwise", async () => {
    // Beat 12 of the reported psi-dash sequence: left hand, DASH e->w, 1 turn
    // CCW, arrow location NORTH. Normal angle is 0 (glyph pointing down), so
    // the override has to land on 90 -- a clockwise quarter turn, glyph
    // pointing left. It used to return 270 and swing the glyph right.
    const motion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.DASH,
      turns: 1,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.WEST,
      arrowLocation: GridLocation.NORTH,
      startOrientation: Orientation.CLOCK,
      endOrientation: Orientation.CLOCK,
    });
    const specialPlacer = {
      hasRotationAngleOverride: async () => true,
    } as unknown as SpecialPlacer;
    const keyGenerator = {
      generateRotationAngleOverrideKey: () => "dash_rot_angle_override",
    } as unknown as IRotationAngleOverrideKeyGenerator;

    expect(dashCounterClockwiseMap[GridLocation.NORTH]).toBe(0);
    await expect(
      checkAndApplyOverride(
        motion,
        GridLocation.NORTH,
        {} as PictographData,
        false,
        specialPlacer,
        keyGenerator
      )
    ).resolves.toBe(90);
  });
});
