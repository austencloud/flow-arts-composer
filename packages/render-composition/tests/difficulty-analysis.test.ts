import { describe, expect, it } from "vitest";
import {
  analyzeDifficultyMotions,
  calculateDifficultyLevelFromMotions,
} from "../src/difficulty-analysis.js";

describe("difficulty analysis", () => {
  it("classifies drawn turns independently of generation settings", () => {
    expect(
      analyzeDifficultyMotions([
        { startOrientation: "in", endOrientation: "out", turns: 1 },
      ])
    ).toEqual({ level: 2, trigger: "turns" });
  });

  it("lets a non-radial visible orientation outrank turns", () => {
    expect(
      analyzeDifficultyMotions([
        { startOrientation: "in", endOrientation: "out", turns: "fl" },
        { startOrientation: "clock", endOrientation: "out", turns: 0 },
      ])
    ).toEqual({ level: 3, trigger: "nonRadial" });
  });

  it("keeps null and empty motion collections at level one", () => {
    expect(calculateDifficultyLevelFromMotions([])).toBe(1);
    expect(calculateDifficultyLevelFromMotions([null, undefined])).toBe(1);
  });
});
