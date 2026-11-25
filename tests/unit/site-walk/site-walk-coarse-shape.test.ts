import { describe, expect, it } from "vitest";
import { CapsuleGeometry } from "three";
import { coarseShape } from "../../../src/routes/test/site-walk/look/site-walk-coarse-shape";

describe("a guest's shadow shape", () => {
  const body = new CapsuleGeometry(0.25, 1.2, 40, 80);
  const part = {
    position: Float32Array.from(body.getAttribute("position").array),
    index: Uint32Array.from(body.index!.array),
  };

  it("is far lighter than the body and keeps its size", () => {
    const g = coarseShape([part], 0.05);
    expect(g.index!.count).toBeLessThan(part.index.length / 3);
    expect(g.index!.count).toBeGreaterThan(300);
    g.computeBoundingBox();
    body.computeBoundingBox();
    for (const axis of ["x", "y", "z"] as const) {
      expect(
        Math.abs(g.boundingBox!.max[axis] - body.boundingBox!.max[axis])
      ).toBeLessThan(0.05);
      expect(
        Math.abs(g.boundingBox!.min[axis] - body.boundingBox!.min[axis])
      ).toBeLessThan(0.05);
    }
  });

  it("drops triangles that two parts share", () => {
    const one = coarseShape([part], 0.05).index!.count;
    expect(coarseShape([part, part], 0.05).index!.count).toBe(one);
  });
});
