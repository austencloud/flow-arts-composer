import { describe, it, expect } from "vitest";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

describe("MotionData.segment discriminator", () => {
  it("is undefined by default (existing motions unaffected)", () => {
    const m = createMotionData({});
    expect(m.segment).toBeUndefined();
  });

  it("round-trips a segment through the factory", () => {
    const m = createMotionData({ segment: { t0: 0, t1: 0.5 } });
    expect(m.segment).toEqual({ t0: 0, t1: 0.5 });
  });

  it("carries the second-half segment too", () => {
    const m = createMotionData({ segment: { t0: 0.5, t1: 1 } });
    expect(m.segment).toEqual({ t0: 0.5, t1: 1 });
  });
});
