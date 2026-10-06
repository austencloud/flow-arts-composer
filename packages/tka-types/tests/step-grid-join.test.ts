import { describe, expect, it } from "vitest";
import {
  createMotion,
  createStep,
  updateStep,
  GridLocation,
  GridPlacement,
  HandSide,
  Letter,
  MotionType,
  Orientation,
  Plane,
  RotationDirection,
  type GridJoin,
  type Motion,
} from "../src/index.js";

function motion(
  hand: HandSide,
  start: GridLocation,
  end: GridLocation
): Motion {
  return createMotion({
    motionType: MotionType.shift,
    startLocation: start,
    endLocation: end,
    rotationDirection: RotationDirection.cw,
    startOrientation: Orientation.in,
    endOrientation: Orientation.out,
    turns: 0,
    plane: Plane.wall,
    hand,
  });
}

const base = {
  id: "step-1-A",
  letter: Letter.A,
  startPlacement: GridPlacement.alpha1,
  endPlacement: GridPlacement.alpha3,
  motions: {
    left: motion(HandSide.LEFT, GridLocation.n, GridLocation.e),
    right: motion(HandSide.RIGHT, GridLocation.s, GridLocation.w),
  },
  stepNumber: 1,
  duration: 1,
};

const east: GridJoin = { toward: "e", steps: 1 };

describe("createStep grid join", () => {
  it("carries no join: a sequence has one join, so a step never keeps its own", () => {
    const step = createStep({ ...base, conjoined: east } as never);
    expect("conjoined" in step).toBe(false);
    expect("conjoined" in updateStep(step, { duration: 2 })).toBe(false);
  });
});
