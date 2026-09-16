import { describe, expect, it } from "vitest";
import {
  createMotion,
  createStartStep,
  createStep,
  updateStep,
  Letter,
  GridLocation,
  GridMode,
  GridPlacement,
  MotionType,
  Orientation,
  Plane,
  HandSide,
  RotationDirection,
  type Motion,
  type Step,
} from "../src/index.js";

function makeBlue(): Motion {
  return createMotion({
    motionType: MotionType.shift,
    startLocation: GridLocation.n,
    endLocation: GridLocation.e,
    rotationDirection: RotationDirection.cw,
    startOrientation: Orientation.in,
    endOrientation: Orientation.out,
    turns: 0,
    plane: Plane.wall,
    hand: HandSide.LEFT,
  });
}

function makeRed(): Motion {
  return createMotion({
    motionType: MotionType.shift,
    startLocation: GridLocation.s,
    endLocation: GridLocation.w,
    rotationDirection: RotationDirection.cw,
    startOrientation: Orientation.in,
    endOrientation: Orientation.out,
    turns: 0,
    plane: Plane.wall,
    hand: HandSide.RIGHT,
  });
}

function baseStep(): Step {
  return createStep({
    id: "step-1-A",
    letter: Letter.A,
    startPlacement: GridPlacement.alpha1,
    endPlacement: GridPlacement.alpha3,
    motions: { left: makeBlue(), right: makeRed() },
    stepNumber: 1,
    duration: 1,
    gridMode: GridMode.diamond,
  });
}

describe("createStep", () => {
  it("builds a Step with required fields intact", () => {
    const s = baseStep();
    expect(s.stepNumber).toBe(1);
    expect(s.letter).toBe("A");
    expect(s.startPlacement).toBe("alpha1");
    expect(s.endPlacement).toBe("alpha3");
    expect(s.duration).toBe(1);
    expect(s.gridMode).toBe("diamond");
  });

  it("freezes the outer Step and the motions record", () => {
    const s = baseStep();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.motions)).toBe(true);
  });

  it("supplies a default id when omitted", () => {
    const s = createStep({
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha3,
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
    });
    expect(typeof s.id).toBe("string");
    expect(s.id.length).toBeGreaterThan(0);
  });

  it("supplies a default id when empty string is passed", () => {
    const s = createStep({
      id: "",
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha3,
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
    });
    expect(typeof s.id).toBe("string");
    expect(s.id.length).toBeGreaterThan(0);
  });

  it("supplies a default duration of 1 when omitted", () => {
    const s = createStep({
      id: "step-1-A",
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha3,
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
    });
    expect(s.duration).toBe(1);
  });

  it("requires stepNumber >= 0", () => {
    expect(() =>
      createStep({
        id: "x",
        letter: Letter.A,
        startPlacement: GridPlacement.alpha1,
        endPlacement: GridPlacement.alpha3,
        motions: { left: makeBlue(), right: makeRed() },
        stepNumber: -1,
        duration: 1,
      })
    ).toThrow(/stepNumber/);
  });

  it("requires duration > 0", () => {
    expect(() =>
      createStep({
        id: "x",
        letter: Letter.A,
        startPlacement: GridPlacement.alpha1,
        endPlacement: GridPlacement.alpha3,
        motions: { left: makeBlue(), right: makeRed() },
        stepNumber: 1,
        duration: 0,
      })
    ).toThrow(/duration/);
  });

  it("rejects swapped motion colors", () => {
    const blueLookingRed = createMotion({
      motionType: MotionType.shift,
      startLocation: GridLocation.n,
      endLocation: GridLocation.e,
      rotationDirection: RotationDirection.cw,
      startOrientation: Orientation.in,
      endOrientation: Orientation.out,
      turns: 0,
      plane: Plane.wall,
      hand: HandSide.RIGHT,
    });
    expect(() =>
      createStep({
        id: "x",
        letter: Letter.A,
        startPlacement: GridPlacement.alpha1,
        endPlacement: GridPlacement.alpha3,
        motions: { left: blueLookingRed, right: makeRed() },
        stepNumber: 1,
        duration: 1,
      })
    ).toThrow(/motions.left.hand/);
  });

  it("rejects invalid gridMode", () => {
    expect(() =>
      createStep({
        id: "x",
        letter: Letter.A,
        startPlacement: GridPlacement.alpha1,
        endPlacement: GridPlacement.alpha3,
        motions: { left: makeBlue(), right: makeRed() },
        stepNumber: 1,
        duration: 1,
        gridMode: "triangle" as unknown as typeof GridMode.diamond,
      })
    ).toThrow(/gridMode/);
  });

  it("rejects invalid variation", () => {
    expect(() =>
      createStep({
        id: "x",
        letter: Letter.A,
        startPlacement: GridPlacement.alpha1,
        endPlacement: GridPlacement.alpha3,
        motions: { left: makeBlue(), right: makeRed() },
        stepNumber: 1,
        duration: 1,
        variation: -3,
      })
    ).toThrow(/variation/);
  });
});

describe("createStartStep", () => {
  it("produces stepNumber 0 with null letter", () => {
    const s = createStartStep(GridPlacement.alpha1);
    expect(s.stepNumber).toBe(0);
    expect(s.letter).toBeNull();
    expect(s.startPlacement).toBe("alpha1");
    expect(s.endPlacement).toBe("alpha1");
  });

  it("colors motions correctly", () => {
    const s = createStartStep(GridPlacement.beta3);
    expect(s.motions.left.hand).toBe("left");
    expect(s.motions.right.hand).toBe("right");
    expect(s.motions.left.motionType).toBe("static");
    expect(s.motions.right.motionType).toBe("static");
  });

  it("freezes the result", () => {
    const s = createStartStep(GridPlacement.gamma1);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.motions)).toBe(true);
  });
});

describe("updateStep", () => {
  it("returns a new frozen Step with changes applied", () => {
    const s = baseStep();
    const updated = updateStep(s, { duration: 2 });
    expect(updated.duration).toBe(2);
    expect(updated).not.toBe(s);
    expect(Object.isFrozen(updated)).toBe(true);
    expect(s.duration).toBe(1); // original untouched
  });

  it("validates changes against field constraints", () => {
    const s = baseStep();
    expect(() => updateStep(s, { stepNumber: -5 })).toThrow(/stepNumber/);
  });
});
