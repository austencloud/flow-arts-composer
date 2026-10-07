import { describe, expect, it } from "vitest";
import {
  generateTurnsTuple,
  turnsTupleDirection,
  type TurnsTupleMotion,
} from "../src/calculations/turns-tuple.js";

const shift = (rotationDirection: string, turns: number): TurnsTupleMotion => ({
  motionType: "pro",
  rotationDirection,
  turns,
  endLocation: "e",
});
const still = (rotationDirection: string, turns: number): TurnsTupleMotion => ({
  motionType: "static",
  rotationDirection,
  turns,
  endLocation: "w",
});

describe("turns tuple", () => {
  it("keys a plain letter by each hand's turns", () => {
    expect(generateTurnsTuple("A", shift("cw", 1), shift("ccw", 0.5))).toBe("(1, 0.5)");
  });

  it("marks a spinning still prop turning with or against the shift", () => {
    const same = generateTurnsTuple("Y", shift("cw", 1), still("cw", 2));
    const opposite = generateTurnsTuple("Y", shift("cw", 1), still("ccw", 2));
    expect(turnsTupleDirection(same)).toBe("s");
    expect(turnsTupleDirection(opposite)).toBe("o");
  });

  it("gives no direction when the still prop does not spin", () => {
    const tuple = generateTurnsTuple("Y", shift("cw", 1), still("no_rotation", 0));
    expect(turnsTupleDirection(tuple)).toBeNull();
  });

  it("falls back to (0, 0) without both hands", () => {
    expect(generateTurnsTuple("Y", shift("cw", 1), null)).toBe("(0, 0)");
    expect(
      generateTurnsTuple("Y", shift("cw", 1), { ...still("cw", 1), isVisible: false })
    ).toBe("(0, 0)");
  });
});
