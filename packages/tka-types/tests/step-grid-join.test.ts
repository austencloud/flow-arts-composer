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
const northwest: GridJoin = { toward: "nw", steps: 2 };

describe("createStep grid join", () => {
  it("keeps the step's own join", () => {
    expect(createStep({ ...base, conjoined: east }).conjoined).toEqual(east);
  });

  it("keeps null, the step that stays on one grid", () => {
    expect(createStep({ ...base, conjoined: null }).conjoined).toBeNull();
  });

  it("leaves the key off when the step follows the sequence", () => {
    expect("conjoined" in createStep(base)).toBe(false);
  });

  it("keeps the join through updateStep, and lets an update change it", () => {
    const joined = createStep({ ...base, conjoined: east });
    expect(updateStep(joined, { duration: 2 }).conjoined).toEqual(east);
    expect(updateStep(joined, { conjoined: northwest }).conjoined).toEqual(
      northwest
    );
    expect(updateStep(joined, { conjoined: null }).conjoined).toBeNull();
  });
});
