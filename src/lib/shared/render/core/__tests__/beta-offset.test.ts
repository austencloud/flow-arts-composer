import { describe, it, expect } from "vitest";
import {
  calculateBetaOffset,
  type BetaMotionInput,
  type BetaOffsetInput,
} from "#lib/shared/render/core/calculations/beta-offset.js";
import { getBetaOffsetSize } from "#lib/shared/render/core/constants/prop-classification.js";
import { HandSide } from "@tka/tka-types";

/**
 * When two props end at the same point (a "beta" position) they must be offset
 * so they don't render on top of each other. calculateBetaOffset is a sequence
 * of skip "gates" followed by a direction lookup. The recurring domain truth is
 * that the two props separate SYMMETRICALLY — blue's offset is the mirror of
 * red's — and that mismatched configurations skip with a zero offset. A wrong
 * gate silently overlaps or mis-separates the props.
 */

function motion(overrides: Partial<BetaMotionInput>): BetaMotionInput {
  return {
    startLocation: "n",
    endLocation: "n",
    motionType: "static",
    hand: HandSide.LEFT,
    ...overrides,
  };
}

describe("calculateBetaOffset — Gate 1: distinct end locations", () => {
  it("returns a zero offset when the props end at different locations", () => {
    const input: BetaOffsetInput = {
      leftMotion: motion({ endLocation: "n", hand: HandSide.LEFT }),
      rightMotion: motion({ endLocation: "s", hand: HandSide.RIGHT }),
      letter: "A",
      gridMode: "diamond",
    };
    expect(calculateBetaOffset(input, input.leftMotion)).toEqual({ x: 0, y: 0 });
    expect(calculateBetaOffset(input, input.rightMotion)).toEqual({ x: 0, y: 0 });
  });
});

describe("calculateBetaOffset — both hands", () => {
  it("separates the two hands horizontally by the hand offset size", () => {
    const input: BetaOffsetInput = {
      // Neither hand starts from an east/west position -> default branch.
      leftMotion: motion({ endLocation: "n", startLocation: "n", hand: HandSide.LEFT, propType: "hand" }),
      rightMotion: motion({ endLocation: "n", startLocation: "n", hand: HandSide.RIGHT, propType: "hand" }),
      letter: "A",
      gridMode: "diamond",
    };
    const left = calculateBetaOffset(input, input.leftMotion);
    const right = calculateBetaOffset(input, input.rightMotion);

    const size = getBetaOffsetSize("hand", "diamond");
    expect(Math.abs(left.x)).toBeCloseTo(size, 6);
    expect(Math.abs(right.x)).toBeCloseTo(size, 6);
    expect(left.y).toBe(0);
    expect(right.y).toBe(0);
    // Symmetric separation.
    expect(left.x).toBeCloseTo(-right.x, 6);
  });

  it("orients by approach: blue-from-east goes right, red-from-west goes left", () => {
    const input: BetaOffsetInput = {
      leftMotion: motion({ endLocation: "n", startLocation: "e", hand: HandSide.LEFT, propType: "hand" }),
      rightMotion: motion({ endLocation: "n", startLocation: "w", hand: HandSide.RIGHT, propType: "hand" }),
      letter: "A",
      gridMode: "diamond",
    };
    const left = calculateBetaOffset(input, input.leftMotion);
    const right = calculateBetaOffset(input, input.rightMotion);
    expect(left.x).toBeGreaterThan(0); // blue from east -> right
    expect(right.x).toBeLessThan(0); // red from west -> left
  });
});

describe("calculateBetaOffset — Gate 3: hybrid orientation skip", () => {
  it("returns a zero offset when one prop is radial and the other non-radial", () => {
    const input: BetaOffsetInput = {
      leftMotion: motion({ endLocation: "n", hand: HandSide.LEFT, motionType: "static", endOrientation: "in", propType: "staff" }),
      rightMotion: motion({ endLocation: "n", hand: HandSide.RIGHT, motionType: "static", endOrientation: "clock", propType: "staff" }),
      letter: "A",
      gridMode: "diamond",
    };
    expect(calculateBetaOffset(input, input.leftMotion)).toEqual({ x: 0, y: 0 });
    expect(calculateBetaOffset(input, input.rightMotion)).toEqual({ x: 0, y: 0 });
  });
});

describe("calculateBetaOffset — symmetric separation (letter G)", () => {
  it("gives blue the exact mirror of red's offset", () => {
    const input: BetaOffsetInput = {
      leftMotion: motion({
        startLocation: "e",
        endLocation: "s",
        motionType: "pro",
        hand: HandSide.LEFT,
        endOrientation: "in",
        propType: "staff",
      }),
      rightMotion: motion({
        startLocation: "w",
        endLocation: "s",
        motionType: "pro",
        hand: HandSide.RIGHT,
        endOrientation: "in",
        propType: "staff",
      }),
      letter: "G",
      gridMode: "diamond",
    };
    const left = calculateBetaOffset(input, input.leftMotion);
    const right = calculateBetaOffset(input, input.rightMotion);

    // The two props must push apart symmetrically.
    expect(left.x).toBeCloseTo(-right.x, 6);
    expect(left.y).toBeCloseTo(-right.y, 6);
    // And the separation must be non-zero (they really do move apart).
    expect(Math.abs(left.x) + Math.abs(left.y)).toBeGreaterThan(0);
  });

  it("uses the staff offset size for the separation magnitude", () => {
    const input: BetaOffsetInput = {
      leftMotion: motion({ startLocation: "e", endLocation: "s", motionType: "pro", hand: HandSide.LEFT, endOrientation: "in", propType: "staff" }),
      rightMotion: motion({ startLocation: "w", endLocation: "s", motionType: "pro", hand: HandSide.RIGHT, endOrientation: "in", propType: "staff" }),
      letter: "G",
      gridMode: "diamond",
    };
    const right = calculateBetaOffset(input, input.rightMotion);
    const size = getBetaOffsetSize("staff", "diamond");
    // South special-case direction is horizontal (right), so magnitude is on x.
    expect(Math.hypot(right.x, right.y)).toBeCloseTo(size, 6);
  });
});

describe("calculateBetaOffset — buugeng opposite chirality nests (Gate 4)", () => {
  it("returns a zero offset for two opposite-chirality buugeng props", () => {
    const input: BetaOffsetInput = {
      leftMotion: motion({ endLocation: "n", hand: HandSide.LEFT, motionType: "static", endOrientation: "in", propType: "buugeng" }),
      rightMotion: motion({ endLocation: "n", hand: HandSide.RIGHT, motionType: "static", endOrientation: "in", propType: "buugeng" }),
      letter: "A",
      gridMode: "diamond",
      leftBuugengFlipped: true,
      rightBuugengFlipped: false,
    };
    expect(calculateBetaOffset(input, input.leftMotion)).toEqual({ x: 0, y: 0 });
  });
});
