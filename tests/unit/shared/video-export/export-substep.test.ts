import { describe, it, expect } from "vitest";
import { computeTrailSubSteps } from "#lib/shared/video-export/services/export-substep.js";

describe("computeTrailSubSteps", () => {
  it("returns 1 for a zero/tiny advance", () => {
    expect(computeTrailSubSteps(0)).toBe(1);
    expect(computeTrailSubSteps(0.001)).toBe(1);
  });
  it("scales with beat delta", () => {
    expect(computeTrailSubSteps(0.5)).toBeGreaterThan(1);
    expect(computeTrailSubSteps(1.0)).toBeGreaterThan(computeTrailSubSteps(0.25));
  });
  it("caps at 32 for huge jumps (loop seams)", () => {
    expect(computeTrailSubSteps(99)).toBe(32);
  });
  it("uses absolute value (handles backward delta)", () => {
    expect(computeTrailSubSteps(-1.0)).toBe(computeTrailSubSteps(1.0));
  });
});
