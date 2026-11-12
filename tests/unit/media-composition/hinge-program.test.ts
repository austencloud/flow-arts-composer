import { describe, expect, it } from "vitest";
import { solveHingeProgram } from "#lib/shared/media-composition/domain/hinge-program.js";

describe("hinge program solver", () => {
  it("stops where a penalty outweighs the cost", () => {
    // min z + 3 * max(0, 1 - z) over 0 <= z <= 5: the penalty wins below 1.
    const { z, cost, gap } = solveHingeProgram({
      n: 1,
      cost: [1],
      hinges: [{ idx: [0], val: [-1], b: -1, weight: 3 }],
      limits: [
        { idx: [0], val: [-1], b: 0 },
        { idx: [0], val: [1], b: 5 },
      ],
      start: [2],
    });
    expect(z[0]).toBeCloseTo(1, 4);
    expect(cost).toBeCloseTo(1, 4);
    expect(gap).toBeLessThan(1e-4);
  });

  it("finds the right corner of a small linear program", () => {
    // max z0 + 2 z1 with z0 + z1 <= 4, z0 + 3 z1 <= 6, z >= 0: the optimum is (3, 1).
    const { z, cost } = solveHingeProgram({
      n: 2,
      cost: [-1, -2],
      hinges: [],
      limits: [
        { idx: [0, 1], val: [1, 1], b: 4 },
        { idx: [0, 1], val: [1, 3], b: 6 },
        { idx: [0], val: [-1], b: 0 },
        { idx: [1], val: [-1], b: 0 },
      ],
      start: [0.5, 0.5],
    });
    expect(z[0]).toBeCloseTo(3, 3);
    expect(z[1]).toBeCloseTo(1, 3);
    expect(cost).toBeCloseTo(-5, 3);
  });
});
