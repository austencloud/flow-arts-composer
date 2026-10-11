import { describe, expect, it } from "vitest";
import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { DIFFICULTY_TO_LEVEL } from "#lib/shared/create/utils/config-mapper.js";
import { mapDifficultyToLevel } from "./sequence-metadata-manager";

describe("mapDifficultyToLevel", () => {
  it("maps every DifficultyLevel to its DIFFICULTY_TO_LEVEL value", () => {
    for (const [difficulty, level] of Object.entries(DIFFICULTY_TO_LEVEL)) {
      expect(mapDifficultyToLevel(difficulty as DifficultyLevel)).toBe(level);
    }
  });

  it("maps SKEWED to level 4, not level 2", () => {
    // Regression: SKEWED had no case in a hand-maintained switch and fell
    // through to the level-2 default, so a Level 4 request silently built
    // at Level 2. DIFFICULTY_TO_LEVEL has always mapped SKEWED -> 4.
    expect(mapDifficultyToLevel(DifficultyLevel.SKEWED)).toBe(4);
  });

  it("still maps the other levels correctly", () => {
    expect(mapDifficultyToLevel(DifficultyLevel.BEGINNER)).toBe(1);
    expect(mapDifficultyToLevel(DifficultyLevel.INTERMEDIATE)).toBe(2);
    expect(mapDifficultyToLevel(DifficultyLevel.ADVANCED)).toBe(3);
  });
});
