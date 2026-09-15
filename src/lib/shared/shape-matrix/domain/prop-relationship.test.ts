import { describe, expect, it } from "vitest";
import {
  derivePropElementalType,
  derivePropElementalTypeForStep,
} from "./prop-relationship";
import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Letter A, diamond: both hands pro, one turn each, starting from alpha1
// (left at south, right at north) with the props pointing in. The props sit
// half a rotation apart and spin the same way: split-same.
const letterA = {
  motions: {
    left: createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.WEST,
      startOrientation: Orientation.IN,
      turns: 1,
    }),
    right: createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      turns: 1,
    }),
  },
};

const alpha1Start = {
  motions: {
    left: createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      turns: 0,
    }),
    right: createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.NORTH,
      startOrientation: Orientation.IN,
      turns: 0,
    }),
  },
};

describe("derivePropElementalTypeForStep", () => {
  it("classifies one step's props from its own motions", () => {
    expect(derivePropElementalTypeForStep(letterA)).toBe(
      TND_BY_FAMILY["split-same"]!.element
    );
  });

  it("agrees with the sequence-level adapter for the same step", () => {
    const sequence = { steps: [letterA] } as unknown as SequenceData;
    expect(derivePropElementalType(sequence)).toBe(
      derivePropElementalTypeForStep(letterA)
    );
  });

  it("gives a start position no prop element (nothing spins yet)", () => {
    expect(derivePropElementalTypeForStep(alpha1Start)).toBeNull();
  });

  it("gives unequal turn rates direction only, so no element", () => {
    const uneven = {
      motions: {
        left: letterA.motions.left,
        right: { ...letterA.motions.right, turns: 2 },
      },
    };
    expect(derivePropElementalTypeForStep(uneven)).toBeNull();
  });

  it("gives a float no element", () => {
    const floated = {
      motions: {
        left: { ...letterA.motions.left, turns: "fl" as const },
        right: letterA.motions.right,
      },
    };
    expect(derivePropElementalTypeForStep(floated)).toBeNull();
  });

  it("ignores a missing or placeholder hand", () => {
    expect(derivePropElementalTypeForStep(null)).toBeNull();
    expect(
      derivePropElementalTypeForStep({
        motions: { left: letterA.motions.left, right: undefined },
      })
    ).toBeNull();
    expect(
      derivePropElementalTypeForStep({
        motions: {
          left: letterA.motions.left,
          right: { ...letterA.motions.right, isVisible: false },
        },
      })
    ).toBeNull();
  });
});
