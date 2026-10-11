import { describe, expect, it } from "vitest";

import {
  buildTheorySpinRatioAtlas,
  makeSpinRatio,
  spinRatioKey,
} from "@vtg/domain";
import {
  buildTheoryAxis,
  theoryFlowerKey,
} from "#lib/shared/shape-matrix/domain/theory-flower.js";

describe("theory axis keeps the matrix contract", () => {
  it("builds four axis entries for every positive ratio in the 0–15 atlas", () => {
    for (const ratio of buildTheorySpinRatioAtlas()) {
      if (ratio.propRotations === 0 || ratio.handCycles === 0) continue;
      const keys = buildTheoryAxis(ratio).map(theoryFlowerKey);
      expect(keys, spinRatioKey(ratio)).toHaveLength(4);
      expect(new Set(keys).size, spinRatioKey(ratio)).toBe(4);
    }
  });

  it("uses a distinct quarter start when an even-cycle path offers one", () => {
    expect(buildTheoryAxis(makeSpinRatio(1, 2)).map(theoryFlowerKey)).toEqual([
      "1:2-pro-in",
      "1:2-pro-clock",
      "1:2-anti-in",
      "1:2-anti-clock",
    ]);
  });

  it("preserves four semantic entries when every compass start shares one locus", () => {
    expect(buildTheoryAxis(makeSpinRatio(1, 4)).map(theoryFlowerKey)).toEqual([
      "1:4-pro-in",
      "1:4-pro-out",
      "1:4-anti-in",
      "1:4-anti-out",
    ]);
  });

  it("keeps the float and stationary endpoints unchanged", () => {
    expect(
      buildTheoryAxis(makeSpinRatio(0, 1)).map((flower) => flower.ori)
    ).toEqual(["in", "out", "clock", "counter"]);
    expect(buildTheoryAxis(makeSpinRatio(1, 0)).map(theoryFlowerKey)).toEqual([
      "1:0-pro-out",
    ]);
  });
});
