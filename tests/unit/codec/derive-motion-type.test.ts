import { describe, it, expect } from "vitest";
import {
  deriveMotionType,
  deriveHandOrbitalDirection,
} from "#lib/shared/render/core/calculations/orientation.js";

describe("deriveHandOrbitalDirection", () => {
  it("returns cw/ccw for shift arcs, null for non-shift geometry", () => {
    expect(deriveHandOrbitalDirection("n", "e")).toBe("cw");
    expect(deriveHandOrbitalDirection("n", "w")).toBe("ccw");
    expect(deriveHandOrbitalDirection("ne", "se")).toBe("cw");
    expect(deriveHandOrbitalDirection("n", "n")).toBeNull();
    expect(deriveHandOrbitalDirection("n", "s")).toBeNull();
    expect(deriveHandOrbitalDirection("n", "c")).toBeNull();
  });
});

describe("deriveMotionType", () => {
  it("float when turns is fl, before any geometry check", () => {
    expect(deriveMotionType("n", "e", "c", "fl")).toBe("float");
  });
  it("shift: pro when rotation matches orbit, anti when opposite", () => {
    expect(deriveMotionType("n", "e", "c", 0)).toBe("pro");
    expect(deriveMotionType("n", "e", "u", 0)).toBe("anti");
    expect(deriveMotionType("n", "e", "c", 1)).toBe("pro");
  });
  it("static when start == end", () => {
    expect(deriveMotionType("n", "n", "x", 0)).toBe("static");
  });
  it("dash for opposite-point straight line", () => {
    expect(deriveMotionType("n", "s", "x", 0)).toBe("dash");
  });
  it("dash (MotionType axis) for perimeter<->center hash geometry", () => {
    expect(deriveMotionType("n", "c", "x", 0)).toBe("dash");
    expect(deriveMotionType("c", "n", "x", 0)).toBe("dash");
  });
});
