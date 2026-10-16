import { describe, expect, it } from "vitest";
import { TURN_LEVELS } from "#lib/shared/create/services/level-turn-values.js";
import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import {
  fuseDifficultyByLevel,
  fuseLevelByDifficulty,
} from "#lib/features/fuse/domain/fuse-difficulty-levels.js";

describe("Fuse difficulty selection", () => {
  it.each(TURN_LEVELS)(
    "round-trips saved level %i through the editor",
    (level) => {
      const difficulty = fuseDifficultyByLevel[level];
      expect(fuseLevelByDifficulty[difficulty]).toBe(level);
    }
  );

  it("keeps quarter-turn recipes on level 4", () => {
    expect(fuseDifficultyByLevel[4]).toBe(DifficultyLevel.SKEWED);
    expect(fuseLevelByDifficulty[DifficultyLevel.SKEWED]).toBe(4);
  });
});
