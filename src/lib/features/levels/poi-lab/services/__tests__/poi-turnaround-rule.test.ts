import { describe, it, expect } from "vitest";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { validateTransition } from "../poi-constraint-validator";

// Austen's turnaround rule (2026-10-18), narrowed by his sitting 1 verdicts on
// 2026-11-22: a poi changes direction only as a pendulum does, on a beat that
// ends pointing out with the hand at a side (east or west), level with the
// floor. Stalls at the top or sides need build-up the checker cannot see, and
// he chose pendulum turns only for now.

const clockwiseHand = {
  startLocation: GridLocation.NORTH,
  endLocation: GridLocation.EAST,
};
const counterHand = {
  startLocation: GridLocation.EAST,
  endLocation: GridLocation.NORTH,
};

function beat(
  hand: { startLocation: GridLocation; endLocation: GridLocation },
  spin: RotationDirection,
  endOrientation: Orientation
) {
  return createMotionData({
    ...hand,
    motionType: MotionType.PRO,
    rotationDirection: spin,
    turns: 1,
    endOrientation,
  });
}

describe("poi turnaround rule", () => {
  it("lets the prop reverse its spin on a beat that ends pointing out", () => {
    const from = beat(
      clockwiseHand,
      RotationDirection.CLOCKWISE,
      Orientation.OUT
    );
    const to = beat(
      clockwiseHand,
      RotationDirection.COUNTER_CLOCKWISE,
      Orientation.OUT
    );
    expect(validateTransition(from, to).isValid).toBe(true);
  });

  it("refuses a spin reversal on a beat that ends pointing in", () => {
    const from = beat(
      clockwiseHand,
      RotationDirection.CLOCKWISE,
      Orientation.IN
    );
    const to = beat(
      clockwiseHand,
      RotationDirection.COUNTER_CLOCKWISE,
      Orientation.OUT
    );
    expect(validateTransition(from, to).isValid).toBe(false);
  });

  it("refuses a spin reversal pointing clock or counter", () => {
    for (const end of [Orientation.CLOCK, Orientation.COUNTER]) {
      const from = beat(clockwiseHand, RotationDirection.CLOCKWISE, end);
      const to = beat(
        clockwiseHand,
        RotationDirection.COUNTER_CLOCKWISE,
        Orientation.OUT
      );
      expect(validateTransition(from, to).isValid).toBe(false);
    }
  });

  it("treats the hand turning back as a turnaround even when the prop keeps its spin", () => {
    const pointingIn = beat(
      clockwiseHand,
      RotationDirection.CLOCKWISE,
      Orientation.IN
    );
    const pointingOut = beat(
      clockwiseHand,
      RotationDirection.CLOCKWISE,
      Orientation.OUT
    );
    const back = beat(
      counterHand,
      RotationDirection.CLOCKWISE,
      Orientation.OUT
    );
    expect(validateTransition(pointingIn, back).isValid).toBe(false);
    expect(validateTransition(pointingOut, back).isValid).toBe(true);
  });

  it("lets a poi point in mid-run when nothing changes direction", () => {
    const from = beat(
      clockwiseHand,
      RotationDirection.CLOCKWISE,
      Orientation.IN
    );
    const to = beat(
      { startLocation: GridLocation.EAST, endLocation: GridLocation.SOUTH },
      RotationDirection.CLOCKWISE,
      Orientation.OUT
    );
    expect(validateTransition(from, to).isValid).toBe(true);
  });

  it("refuses a turn pointing out at the top or bottom, or on a diagonal", () => {
    for (const end of [
      GridLocation.NORTH,
      GridLocation.SOUTH,
      GridLocation.NORTHEAST,
      GridLocation.SOUTHWEST,
    ]) {
      const hand = {
        startLocation:
          end === GridLocation.NORTH
            ? GridLocation.NORTHWEST
            : GridLocation.EAST,
        endLocation: end,
      };
      const from = beat(hand, RotationDirection.CLOCKWISE, Orientation.OUT);
      const to = beat(
        hand,
        RotationDirection.COUNTER_CLOCKWISE,
        Orientation.OUT
      );
      expect(validateTransition(from, to).isValid, end).toBe(false);
    }
  });

  it("lets a pendulum turn on the west side too", () => {
    const hand = {
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.WEST,
    };
    const from = beat(hand, RotationDirection.CLOCKWISE, Orientation.OUT);
    const to = beat(hand, RotationDirection.COUNTER_CLOCKWISE, Orientation.OUT);
    expect(validateTransition(from, to).isValid).toBe(true);
  });
});
