import { describe, it, expect } from "vitest";
import { computeFireStepDt } from "#lib/shared/animation-engine/services/fire/web-gl-fire-renderer.js";

describe("computeFireStepDt", () => {
  it("uses the provided dt, clamped to 0.066s", () => {
    expect(computeFireStepDt(0.02, false)).toBeCloseTo(0.02, 5);
    expect(computeFireStepDt(5.0, false)).toBeCloseTo(0.066, 5);
  });
  it("floors non-positive dt to 0.016s", () => {
    expect(computeFireStepDt(0, false)).toBeCloseTo(0.016, 5);
    expect(computeFireStepDt(-1, false)).toBeCloseTo(0.016, 5);
  });
  it("scales by 0.2 under reduced motion", () => {
    expect(computeFireStepDt(0.02, true)).toBeCloseTo(0.004, 5);
  });
});
