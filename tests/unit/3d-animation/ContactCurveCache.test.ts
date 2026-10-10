import { describe, it, expect } from "vitest";
import {
  createContactCurveCache,
  registerCurve,
  getContactAt,
  type ContactCurveData,
} from "#lib/shared/3d/services/contact-curve-cache.js";

const testCurve: ContactCurveData = {
  clipName: "test-clip",
  frameRate: 30,
  frameCount: 4,
  leftFoot:  [1.0, 1.0, 0.0, 0.0],
  rightFoot: [0.0, 0.0, 1.0, 1.0],
};

describe("ContactCurveCache", () => {
  it("returns zero contact when no curve is registered", () => {
    const cache = createContactCurveCache();
    const result = getContactAt(cache, "unknown-clip", 0.5);
    expect(result.leftFoot).toBe(0);
    expect(result.rightFoot).toBe(0);
    expect(result.hasCurve).toBe(false);
  });

  it("samples the first frame at phase 0", () => {
    const cache = createContactCurveCache();
    registerCurve(cache, testCurve);
    const result = getContactAt(cache, "test-clip", 0);
    expect(result.leftFoot).toBeCloseTo(1.0);
    expect(result.rightFoot).toBeCloseTo(0.0);
    expect(result.hasCurve).toBe(true);
  });

  it("samples the last frame at phase 1", () => {
    const cache = createContactCurveCache();
    registerCurve(cache, testCurve);
    const result = getContactAt(cache, "test-clip", 1);
    expect(result.leftFoot).toBeCloseTo(0.0);
    expect(result.rightFoot).toBeCloseTo(1.0);
  });

  it("linearly interpolates between frames", () => {
    const cache = createContactCurveCache();
    registerCurve(cache, testCurve);
    // Phase 0.5 = between frames 1 and 2 (0.5 * 3 = 1.5)
    // left:  frames [1.0, 1.0, 0.0, 0.0] -> at index 1.5 -> 0.5
    // right: frames [0.0, 0.0, 1.0, 1.0] -> at index 1.5 -> 0.5
    const result = getContactAt(cache, "test-clip", 0.5);
    expect(result.leftFoot).toBeCloseTo(0.5, 3);
    expect(result.rightFoot).toBeCloseTo(0.5, 3);
  });

  it("clamps out-of-range phase", () => {
    const cache = createContactCurveCache();
    registerCurve(cache, testCurve);
    const low = getContactAt(cache, "test-clip", -0.5);
    const high = getContactAt(cache, "test-clip", 1.5);
    expect(low.leftFoot).toBeCloseTo(1.0);
    expect(high.rightFoot).toBeCloseTo(1.0);
  });
});
