import { describe, it, expect } from "vitest";
import {
  orientationToStaffAngle,
  staffAngleToOrientation,
  RADIAL_CYCLE,
} from "#lib/shared/render/core/calculations/orientation-angle.js";
import type { Orientation } from "#lib/shared/render/core/types.js";

const PI = Math.PI;
const QUARTER = PI / 4;

describe("orientationToStaffAngle (8-point forward map)", () => {
  const cases: Array<[Orientation, number]> = [
    ["out", 0],
    ["clockOut", QUARTER],
    ["clock", PI / 2],
    ["clockIn", (3 * PI) / 4],
    ["in", PI],
    ["counterIn", (5 * PI) / 4],
    ["counter", (3 * PI) / 2],
    ["counterOut", (7 * PI) / 4],
  ];
  for (const [ori, expected] of cases) {
    it(`${ori} -> ${expected.toFixed(4)} at centerPathAngle 0`, () => {
      expect(orientationToStaffAngle(ori, 0)).toBeCloseTo(expected, 6);
    });
  }

  it("is offset by centerPathAngle (relative, not absolute)", () => {
    expect(orientationToStaffAngle("out", PI / 2)).toBeCloseTo(PI / 2, 6);
    expect(orientationToStaffAngle("in", PI / 2)).toBeCloseTo((3 * PI) / 2, 6);
  });
});

describe("staffAngleToOrientation (inverse)", () => {
  it("round-trips every radial orientation at several centerPathAngles", () => {
    for (const centerPathAngle of [0, PI / 2, PI, 1.234]) {
      for (const ori of RADIAL_CYCLE) {
        const angle = orientationToStaffAngle(ori, centerPathAngle);
        expect(staffAngleToOrientation(angle, centerPathAngle)).toBe(ori);
      }
    }
  });

  it("returns null for an off-lattice (22.5deg) angle", () => {
    expect(staffAngleToOrientation(PI / 8, 0)).toBeNull();
  });

  it("tolerates small floating-point noise (within epsilon)", () => {
    expect(staffAngleToOrientation(PI / 2 + 1e-9, 0)).toBe("clock");
  });
});
