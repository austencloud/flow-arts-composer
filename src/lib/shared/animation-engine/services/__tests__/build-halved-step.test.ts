import { describe, it, expect } from "vitest";
import { buildHalvedStep } from "#lib/shared/animation-engine/services/build-halved-step.js";
import { calculateOrientationAt } from "#lib/shared/animation-engine/services/orientation-at.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import {
  createMotionData,
  isVisibleMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

describe("buildHalvedStep — real motion families", () => {
  it("PRO E->S, IN->IN, CW, 1 turn (red real, blue placeholder)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    const result = buildHalvedStep(step);

    expect(result).not.toBeNull();
    expect(result!.motions.right.endLocation).toBe(GridLocation.SOUTHEAST);
    expect(result!.motions.right.segment).toEqual({ t0: 0, t1: 0.5 });

    // Derive the expectation from calculateOrientationAt itself — don't hardcode
    // the orientation value.
    const expectedOrientation = calculateOrientationAt(
      {
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.SOUTH,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        turns: 1,
      },
      0.5,
      HandSide.RIGHT
    );
    expect(expectedOrientation).not.toBeNull();
    expect(result!.motions.right.endOrientation).toBe(expectedOrientation);
  });

  it("ANTI E->S, IN->OUT, CCW, 2 turns", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.ANTI,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      turns: 2,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    const result = buildHalvedStep(step);

    expect(result).not.toBeNull();
    expect(result!.motions.right.endLocation).toBe(GridLocation.SOUTHEAST);
    expect(result!.motions.right.segment).toEqual({ t0: 0, t1: 0.5 });
  });

  it("DASH S->N, IN->OUT, CCW, 2 turns -> halfway location is CENTER", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.DASH,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.NORTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      turns: 2,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    const result = buildHalvedStep(step);

    expect(result).not.toBeNull();
    expect(result!.motions.right.endLocation).toBe(GridLocation.CENTER);
    expect(result!.motions.right.segment).toEqual({ t0: 0, t1: 0.5 });
  });

  it("hash (center-touching dash) E->C -> null (midpoint is off the named grid)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.DASH,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.CENTER,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      turns: 2,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    expect(buildHalvedStep(step)).toBeNull();
  });

  it("STATIC E->E, IN->IN, CCW, 2 turns -> halfway location is the (unchanged) start", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.STATIC,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      turns: 2,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    const result = buildHalvedStep(step);

    expect(result).not.toBeNull();
    expect(result!.motions.right.endLocation).toBe(GridLocation.EAST);
    expect(result!.motions.right.segment).toEqual({ t0: 0, t1: 0.5 });
  });

  it("left-hand case: passes the hand's own HandSide to calculateOrientationAt instead of hardcoding right", () => {
    const leftMotion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.ANTI,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
    });
    const step = createStepData({ motions: { left: leftMotion } });

    const result = buildHalvedStep(step);

    expect(result).not.toBeNull();
    expect(result!.motions.left.endOrientation).not.toBeNull();
    expect(result!.motions.left.segment).toEqual({ t0: 0, t1: 0.5 });
  });
});

describe("buildHalvedStep — off-lattice and unsupported-motion guards", () => {
  it("returns null for an off-lattice quarter-turn motion (turns=0.25)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 0.25,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    expect(buildHalvedStep(step)).toBeNull();
  });

  it("returns null for a FLOAT motion (no float_half asset exists)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.FLOAT,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    expect(buildHalvedStep(step)).toBeNull();
  });

  it("returns null for a skewed motion (skewSteps set)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
      skewSteps: 1,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    expect(buildHalvedStep(step)).toBeNull();
  });

  it("returns null for a shift whose start/end aren't a single 45deg-adjacent hop (unknown pair)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.SOUTH, // opposite cardinal — not a single arc segment
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    expect(buildHalvedStep(step)).toBeNull();
  });

  it("returns null for t !== 0.5 (v1 is midpoint-only)", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    expect(buildHalvedStep(step, 0.25)).toBeNull();
  });

  it("carries a placeholder hand through unchanged", () => {
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      isVisible: true,
    });
    const step = createStepData({ motions: { right: rightMotion } });

    // createStepData fills the omitted blue hand with an invisible placeholder.
    expect(isVisibleMotion(step.motions.left)).toBe(false);

    const result = buildHalvedStep(step);

    expect(result).not.toBeNull();
    expect(result!.motions.left).toBe(step.motions.left);
    expect(isVisibleMotion(result!.motions.left)).toBe(false);
  });
});
