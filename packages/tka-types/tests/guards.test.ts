import { describe, expect, it } from "vitest";
import {
  createMotion,
  createStep,
  createStartStep,
  isMotion,
  isStep,
  GridLocation,
  GridPlacement,
  Letter,
  MotionType,
  Orientation,
  Plane,
  HandSide,
  RotationDirection,
} from "../src/index.js";

function makeBlue() {
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

function makeRed() {
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

describe("isMotion", () => {
  it("accepts a well-formed Motion", () => {
    expect(isMotion(makeBlue())).toBe(true);
  });

  it("accepts turns: 'fl' on float motions", () => {
    const float = createMotion({
      motionType: MotionType.float,
      startLocation: GridLocation.n,
      endLocation: GridLocation.e,
      rotationDirection: RotationDirection.cw,
      startOrientation: Orientation.in,
      endOrientation: Orientation.out,
      turns: "fl",
      plane: Plane.wall,
      hand: HandSide.LEFT,
    });
    expect(isMotion(float)).toBe(true);
  });

  it("rejects null", () => {
    expect(isMotion(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isMotion(undefined)).toBe(false);
  });

  it("rejects a plain object missing required fields", () => {
    expect(isMotion({ motionType: "shift" })).toBe(false);
  });

  it("rejects an object with an invalid enum value", () => {
    const bad = { ...makeBlue(), motionType: "bogus" };
    expect(isMotion(bad)).toBe(false);
  });

  it("rejects an object with non-finite turns", () => {
    const bad = { ...makeBlue(), turns: Number.POSITIVE_INFINITY };
    expect(isMotion(bad)).toBe(false);
  });

  it("rejects an array", () => {
    expect(isMotion([])).toBe(false);
  });
});

describe("isStep", () => {
  it("accepts a well-formed Step", () => {
    const s = createStep({
      id: "step-1-A",
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha3,
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
    });
    expect(isStep(s)).toBe(true);
  });

  it("accepts a start-placement Step (letter null, stepNumber 0)", () => {
    const s = createStartStep(GridPlacement.beta1);
    expect(isStep(s)).toBe(true);
  });

  it("rejects a Step whose motions.left.hand is 'right'", () => {
    const s = createStep({
      id: "step-1-A",
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha3,
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
    });
    // Tamper with a clone (guards operate on untrusted input)
    const tampered = {
      ...s,
      motions: { left: { ...s.motions.left, hand: "right" }, right: s.motions.right },
    };
    expect(isStep(tampered)).toBe(false);
  });

  it("rejects null", () => {
    expect(isStep(null)).toBe(false);
  });

  it("rejects a Step with empty id", () => {
    const candidate = {
      id: "",
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "alpha3",
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
    };
    expect(isStep(candidate)).toBe(false);
  });

  it("rejects a Step with negative stepNumber", () => {
    const candidate = {
      id: "x",
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "alpha3",
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: -1,
      duration: 1,
    };
    expect(isStep(candidate)).toBe(false);
  });

  it("rejects a Step with unknown gridMode", () => {
    const candidate = {
      id: "x",
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "alpha3",
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
      gridMode: "hex",
    };
    expect(isStep(candidate)).toBe(false);
  });

  it("rejects a Step whose motions.right is not a Motion", () => {
    const candidate = {
      id: "x",
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "alpha3",
      motions: { left: makeBlue(), right: { hand: "right" } },
      stepNumber: 1,
      duration: 1,
    };
    expect(isStep(candidate)).toBe(false);
  });

  it("accepts a Step with startPlacement = null (partial)", () => {
    const candidate = {
      id: "x",
      letter: "A",
      startPlacement: null,
      endPlacement: "alpha3",
      motions: { left: makeBlue(), right: makeRed() },
      stepNumber: 1,
      duration: 1,
    };
    expect(isStep(candidate)).toBe(true);
  });
});
