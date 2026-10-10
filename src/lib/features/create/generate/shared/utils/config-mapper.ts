/**
 * @deprecated Import from $lib/shared/create/utils/config-mapper instead.
 * This barrel re-exports everything for backwards compatibility.
 */
export {
  LEVEL_TO_DIFFICULTY,
  DIFFICULTY_TO_LEVEL,
  levelToDifficulty,
  difficultyToLevel,
  MAX_AVAILABLE_LEVEL,
  clampToAvailableLevel,
  uiConfigToGenerationOptions,
  generationOptionsToUIConfig,
} from "#lib/shared/create/utils/config-mapper.js";
export type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";
