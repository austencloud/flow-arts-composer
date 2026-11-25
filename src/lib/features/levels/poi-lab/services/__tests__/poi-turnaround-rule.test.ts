import { describe, it, expect } from "vitest";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { calculateMotionEndpoints } from "#lib/shared/animation-engine/services/endpoint-calculator.js";
import { validateTransition } from "../poi-constraint-validator";

// Austen's turnaround rule (2026-10-18), narrowed by his sitting 1 verdicts on
// 2026-11-22: a poi changes direction only as a pendulum does, on a beat that
// ends pointing out with the hand at a side (east or west), level with the
// floor, and falling away from the turn (2026-11-23). Stalls at the top or sides need build-up the checker cannot see, and
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
  const eastFromBelow = {
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.EAST,
  };
  const westFromBelow = {
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
  };
  const downFromEast = {
    startLocation: GridLocation.EAST,
    endLocation: GridLocation.SOUTH,
  };
  const downFromWest = {
    startLocation: GridLocation.WEST,
    endLocation: GridLocation.SOUTH,
  };
  const cw = RotationDirection.CLOCKWISE;
  const ccw = RotationDirection.COUNTER_CLOCKWISE;

  it("lets a poi swing up to a side and fall back", () => {
    expect(
      validateTransition(
        beat(eastFromBelow, ccw, Orientation.OUT),
        beat(downFromEast, cw, Orientation.OUT)
      ).isValid
    ).toBe(true);
    expect(
      validateTransition(
        beat(westFromBelow, cw, Orientation.OUT),
        beat(downFromWest, ccw, Orientation.OUT)
      ).isValid
    ).toBe(true);
  });

  // Austen, 2026-11-23: a pendulum on the top half is physically impossible.
  it("refuses a turn that swings back up over the top", () => {
    expect(
      validateTransition(
        beat(eastFromBelow, cw, Orientation.OUT),
        beat(downFromEast, ccw, Orientation.OUT)
      ).isValid
    ).toBe(false);
    expect(
      validateTransition(
        beat(westFromBelow, ccw, Orientation.OUT),
        beat(downFromWest, cw, Orientation.OUT)
      ).isValid
    ).toBe(false);
  });

  it("agrees with the animation about which way falls", () => {
    for (const [hand, spin] of [
      [downFromEast, cw],
      [downFromWest, ccw],
    ] as const) {
      const ends = calculateMotionEndpoints({
        ...beat(hand, spin, Orientation.OUT),
        startOrientation: Orientation.OUT,
      });
      /* The canvas's y grows downward, so a falling head gains y. */
      const height = (part: number) =>
        Math.sin(ends.startStaffAngle + ends.staffRotationDelta * part);
      expect(height(0)).toBeCloseTo(0, 6);
      expect(height(0.05)).toBeGreaterThan(0);
    }
  });

  it("refuses a spin reversal on a beat that ends pointing in", () => {
    const from = beat(
      clockwiseHand,
      RotationDirection.COUNTER_CLOCKWISE,
      Orientation.IN
    );
    const to = beat(
      clockwiseHand,
      RotationDirection.CLOCKWISE,
      Orientation.OUT
    );
    expect(validateTransition(from, to).isValid).toBe(false);
  });

  it("refuses a spin reversal pointing clock or counter", () => {
    for (const end of [Orientation.CLOCK, Orientation.COUNTER]) {
      const from = beat(
        clockwiseHand,
        RotationDirection.COUNTER_CLOCKWISE,
        end
      );
      const to = beat(
        clockwiseHand,
        RotationDirection.CLOCKWISE,
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
});
