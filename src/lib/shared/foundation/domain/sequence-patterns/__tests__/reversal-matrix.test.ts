import { describe, it, expect } from "vitest";
import {
  matrixFromSpins,
  matrixFromSymbols,
  matrixToSymbols,
} from "../reversal-matrix";
import { REVERSAL_PATTERNS } from "../reversal-patterns";
import { resolvePattern, resolveMatrix } from "#lib/features/choreo-card/domain/reversal-transform.js";

describe("reversal matrix", () => {
  it("tiles every named pattern losslessly", () => {
    for (const def of REVERSAL_PATTERNS) {
      for (const n of [4, 8, 12, 16]) {
        const m = matrixFromSymbols(def.sequence, n);
        const tiled = Array.from({ length: n }, (_, i) => def.sequence[i % def.sequence.length]).join("");
        expect(matrixToSymbols(m)).toBe(tiled);
      }
    }
  });

  it("resolveMatrix matches resolvePattern on the same flags", () => {
    for (const def of REVERSAL_PATTERNS) {
      const m = matrixFromSymbols(def.sequence, 8);
      expect(resolveMatrix(m)).toEqual(resolvePattern([...m.left], [...m.right]));
    }
  });

  it("collapses absolute spins into spin-change reversals, skipping inert steps", () => {
    const m = matrixFromSpins([
      { left: "cw", right: "cw" },
      { left: "ccw", right: "none" },
      { left: "ccw", right: "ccw" },
      { left: "cw", right: null },
    ]);
    expect(m.left).toEqual([false, true, false, true]);
    // Right: step 2 is inert, so step 3 compares against step 1.
    expect(m.right).toEqual([false, false, true, false]);
  });

  it("wraps the first spinning step on a loop", () => {
    const steps = [
      { left: "cw", right: "cw" },
      { left: "ccw", right: "cw" },
    ] as const;
    expect(matrixFromSpins(steps, { loop: true }).left).toEqual([true, true]);
    expect(matrixFromSpins(steps, { loop: true }).right).toEqual([false, false]);
    expect(matrixFromSpins(steps).left).toEqual([false, true]);
  });
});
