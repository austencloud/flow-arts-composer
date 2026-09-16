/**
 * Tests for motion-signals — hand-arc direction and prop-rotation extraction.
 *
 * The hand-arc geometry must agree with the pre-existing primitive
 * `HAND_ROTATION_DIRECTION_MAP` (loop/placement-maps) on every pair it defines,
 * and extend it totally (mixed cardinal↔intercardinal pairs, center, unknown
 * data) without throwing.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  handArcDirection,
  propRotationDirection,
} from "../../src/analysis/motion-signals.js";
import { HAND_ROTATION_DIRECTION_MAP } from "../../src/loop/placement-maps/circular-placement-maps.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handArcDirection — endpoint geometry", () => {
  it("agrees with HAND_ROTATION_DIRECTION_MAP on all 32 canonical pairs", () => {
    for (const [key, expected] of HAND_ROTATION_DIRECTION_MAP.entries()) {
      const [start, end] = key.split(",");
      const arc = handArcDirection({ startLocation: start, endLocation: end });
      const want = expected === "cw" || expected === "ccw" ? expected : null;
      expect(arc, `pair ${key}`).toBe(want);
    }
  });

  it("resolves mixed cardinal↔intercardinal pairs by shortest arc", () => {
    expect(handArcDirection({ startLocation: "n", endLocation: "ne" })).toBe("cw");
    expect(handArcDirection({ startLocation: "n", endLocation: "nw" })).toBe("ccw");
    expect(handArcDirection({ startLocation: "e", endLocation: "nw" })).toBe("ccw"); // 5 cw steps → ccw is shorter
    expect(handArcDirection({ startLocation: "sw", endLocation: "n" })).toBe("cw"); // 3 cw steps → cw is shorter
  });

  it("returns null for static, dash, center, and unknown locations", () => {
    expect(handArcDirection({ startLocation: "n", endLocation: "n" })).toBeNull();
    expect(handArcDirection({ startLocation: "n", endLocation: "s" })).toBeNull();
    expect(handArcDirection({ startLocation: "c", endLocation: "n" })).toBeNull();
    expect(handArcDirection({ startLocation: "n", endLocation: "c" })).toBeNull();
    expect(handArcDirection({ startLocation: "??", endLocation: "n" })).toBeNull();
    expect(handArcDirection({})).toBeNull();
    expect(handArcDirection(null)).toBeNull();
    expect(handArcDirection(undefined)).toBeNull();
  });
});

describe("handArcDirection — authored handPath wins", () => {
  it("prefers an authored cw/ccw handPath over endpoint geometry (skewed long-way arcs)", () => {
    // Geometry says w→n is cw, but the authored path says the hand went the
    // long way around (skewSteps) — authored wins.
    expect(
      handArcDirection({ startLocation: "w", endLocation: "n", handPath: "ccw" })
    ).toBe("ccw");
  });

  it("gives floats an arc from their authored handPath (no rotation to derive from)", () => {
    expect(
      handArcDirection({
        motionType: "float",
        startLocation: "w",
        endLocation: "n",
        handPath: "cw",
      })
    ).toBe("cw");
  });

  it("treats authored dash/static/hash paths as arc-less", () => {
    for (const p of ["dash", "static", "hashIn", "hashOut"]) {
      expect(
        handArcDirection({ startLocation: "w", endLocation: "n", handPath: p })
      ).toBeNull();
    }
  });

  it("falls back to geometry when handPath is null or absent", () => {
    expect(
      handArcDirection({ startLocation: "w", endLocation: "n", handPath: null })
    ).toBe("cw");
  });
});

describe("propRotationDirection — production fallback semantics", () => {
  it("returns the explicit rotation direction", () => {
    expect(propRotationDirection({ rotationDirection: "cw" })).toBe("cw");
    expect(propRotationDirection({ rotationDirection: "ccw" })).toBe("ccw");
    expect(propRotationDirection({ rotationDirection: "noRotation" })).toBe(
      "noRotation"
    );
  });

  it("normalizes the legacy no_rot spelling", () => {
    expect(propRotationDirection({ rotationDirection: "no_rot" })).toBe(
      "noRotation"
    );
  });

  it("treats static and dash without rotationDirection as noRotation (no warn)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(propRotationDirection({ motionType: "static" })).toBe("noRotation");
    expect(propRotationDirection({ motionType: "dash" })).toBe("noRotation");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and defaults to cw for pro/anti/float missing rotationDirection (bad data)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(propRotationDirection({ motionType: "pro" })).toBe("cw");
    expect(warn).toHaveBeenCalled();
  });

  it("returns null for a missing motion", () => {
    expect(propRotationDirection(null)).toBeNull();
    expect(propRotationDirection(undefined)).toBeNull();
  });
});
