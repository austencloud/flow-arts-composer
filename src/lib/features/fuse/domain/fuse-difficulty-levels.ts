import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { TurnLevel } from "#lib/shared/create/services/level-turn-values.js";

export const fuseDifficultyByLevel: Record<TurnLevel, DifficultyLevel> = {
  1: DifficultyLevel.BEGINNER,
  2: DifficultyLevel.INTERMEDIATE,
  3: DifficultyLevel.ADVANCED,
  4: DifficultyLevel.SKEWED,
};

export const fuseLevelByDifficulty: Record<DifficultyLevel, TurnLevel> = {
  [DifficultyLevel.BEGINNER]: 1,
  [DifficultyLevel.INTERMEDIATE]: 2,
  [DifficultyLevel.ADVANCED]: 3,
  [DifficultyLevel.SKEWED]: 4,
};
