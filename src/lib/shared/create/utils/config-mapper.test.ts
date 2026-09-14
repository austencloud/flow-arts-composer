import { describe, expect, it } from "vitest";
import { DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  DIFFICULTY_TO_LEVEL,
  LEVEL_TO_DIFFICULTY,
  difficultyToLevel,
  levelToDifficulty,
} from "./config-mapper";

// The UI speaks levels (1-4), the generation engine speaks DifficultyLevel, and
// a request crosses that boundary twice: once on the way in and once when the
// built sequence is stamped with metadata.level. Both maps have to stay exact
// inverses or a level silently changes value mid-flight — which is exactly how
// a Level 4 (SKEWED) request used to come back as Level 2, generating with the
// whole-turn palette instead of quarter turns.
const UI_LEVELS = [1, 2, 3, 4] as const;

describe("level <-> difficulty round trip", () => {
  it.each(UI_LEVELS)("level %i survives level -> difficulty -> level", (level) => {
    expect(difficultyToLevel(levelToDifficulty(level))).toBe(level);
  });

  it.each(Object.values(DifficultyLevel))(
    "%s survives difficulty -> level -> difficulty",
    (difficulty) => {
      expect(levelToDifficulty(difficultyToLevel(difficulty))).toBe(difficulty);
    }
  );

  it("maps each UI level to a distinct difficulty", () => {
    const difficulties = UI_LEVELS.map(levelToDifficulty);
    expect(new Set(difficulties).size).toBe(UI_LEVELS.length);
  });

  // Guards the failure mode directly: both fallbacks return the level-2 /
  // INTERMEDIATE default, so a missing entry looks like a valid answer rather
  // than throwing. Adding a fifth difficulty without extending both tables
  // fails here instead of quietly downgrading generate requests.
  it("covers every DifficultyLevel in both tables", () => {
    for (const difficulty of Object.values(DifficultyLevel)) {
      expect(DIFFICULTY_TO_LEVEL[difficulty]).toBeDefined();
    }
    expect(Object.keys(LEVEL_TO_DIFFICULTY)).toHaveLength(
      Object.values(DifficultyLevel).length
    );
  });

  it("maps SKEWED to level 4 in both directions", () => {
    expect(difficultyToLevel(DifficultyLevel.SKEWED)).toBe(4);
    expect(levelToDifficulty(4)).toBe(DifficultyLevel.SKEWED);
  });
});
