import { describe, expect, it } from "vitest";
import { SampledCurlGrid2D } from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";

describe("SampledCurlGrid2D allocation-free sampling", () => {
  it("writes the same field sample into a stable caller-owned object", () => {
    const grid = new SampledCurlGrid2D(32, 8, 1);
    const scratch = { vx: 0, vy: 0 };
    const returned = grid.sampleInto(1.2, 3.4, 0, scratch);
    const allocated = grid.sample(1.2, 3.4, 0);

    expect(returned).toBe(scratch);
    expect(scratch.vx).toBeCloseTo(allocated.vx, 7);
    expect(scratch.vy).toBeCloseTo(allocated.vy, 7);
  });
});
