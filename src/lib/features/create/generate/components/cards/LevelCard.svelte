<!--
LevelCard.svelte - Card for selecting difficulty level
Uses stepper pattern for space-efficient level selection
-->
<script lang="ts">
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { isBrightBackground } from "../../shared/domain/card-colors";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { DIFFICULTY_LEVELS } from "#lib/shared/config/difficulty-styles.js";
  import { MAX_AVAILABLE_LEVEL } from "#lib/shared/create/utils/config-mapper.js";
  import StepperCard from "./StepperCard/StepperCard.svelte";

  let {
    currentLevel,
    onLevelChange,
    brightBackgroundOverride,
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
    appearance = "vivid",
  } = $props<{
    currentLevel: DifficultyLevel;
    onLevelChange: (level: DifficultyLevel) => void;
    /** Pins the palette for isolated embeds that do not share app settings. */
    brightBackgroundOverride?: boolean;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
    appearance?: "vivid" | "quiet";
  }>();

  // The app follows its selected background. Isolated embeds can pin the
  // palette so a visitor's saved setting cannot restyle the card.
  const useDarkColors = $derived.by(
    () =>
      brightBackgroundOverride ??
      isBrightBackground(
        settingsService.settings.backgroundType ?? BackgroundType.WINTER
      )
  );

  // 🎨 Level display data - default colors from canonical difficulty-styles.ts
  const LEVEL_MAP: Record<DifficultyLevel, number> = {
    [DifficultyLevel.BEGINNER]: 1,
    [DifficultyLevel.INTERMEDIATE]: 2,
    [DifficultyLevel.ADVANCED]: 3,
    [DifficultyLevel.SKEWED]: 4,
  };

  const defaultLevelData: Record<
    DifficultyLevel,
    { name: string; number: number; color: string; textColor: string }
  > = {
    [DifficultyLevel.BEGINNER]: {
      name: t("generator_level_no_turns"),
      number: 1,
      color: DIFFICULTY_LEVELS[1]!.cssBg,
      textColor: DIFFICULTY_LEVELS[1]!.text,
    },
    [DifficultyLevel.INTERMEDIATE]: {
      name: t("generator_level_whole_turns"),
      number: 2,
      color: DIFFICULTY_LEVELS[2]!.cssBg,
      textColor: DIFFICULTY_LEVELS[2]!.text,
    },
    [DifficultyLevel.ADVANCED]: {
      name: t("generator_level_half_turns"),
      number: 3,
      color: DIFFICULTY_LEVELS[3]!.cssBg,
      textColor: DIFFICULTY_LEVELS[3]!.text,
    },
    [DifficultyLevel.SKEWED]: {
      name: t("generator_level_skewed"),
      number: 4,
      color: DIFFICULTY_LEVELS[4]!.cssBg,
      textColor: DIFFICULTY_LEVELS[4]!.text,
    },
  };

  // 🎨 Vibrant but darker colors for bright/glowing backgrounds (Aurora, Ember)
  const brightBgLevelData: Record<
    DifficultyLevel,
    { name: string; number: number; color: string; textColor: string }
  > = {
    [DifficultyLevel.BEGINNER]: {
      name: t("generator_level_no_turns"),
      number: 1,
      // Slightly darker baby blue - still light but with a touch more depth
      color: `radial-gradient(ellipse at top left,
        rgb(165, 218, 250) 0%,
        rgb(105, 195, 248) 30%,
        rgb(45, 175, 240) 70%,
        rgb(8, 145, 210) 100%)`,
      textColor: "black",
    },
    [DifficultyLevel.INTERMEDIATE]: {
      name: t("generator_level_whole_turns"),
      number: 2,
      // Rich cool slate - not too dark
      color: `radial-gradient(ellipse at top left,
        rgb(148, 163, 184) 0%,
        rgb(100, 116, 139) 30%,
        rgb(71, 85, 105) 70%,
        rgb(51, 65, 85) 100%)`,
      textColor: "black",
    },
    [DifficultyLevel.ADVANCED]: {
      name: t("generator_level_half_turns"),
      number: 3,
      // Rich gold - stays in gold family, doesn't drift to orange
      color: `radial-gradient(ellipse at top left,
        rgb(253, 224, 71) 0%,
        rgb(250, 204, 21) 20%,
        rgb(234, 179, 8) 40%,
        rgb(217, 155, 6) 60%,
        rgb(202, 138, 4) 80%,
        rgb(180, 115, 5) 100%)`,
      textColor: "black",
    },
    [DifficultyLevel.SKEWED]: {
      name: t("generator_level_skewed"),
      number: 4,
      // Rich red - deeper red for bright backgrounds
      color: `radial-gradient(ellipse at top left,
        rgb(255, 140, 140) 0%,
        rgb(255, 100, 100) 20%,
        rgb(239, 68, 68) 40%,
        rgb(220, 38, 38) 60%,
        rgb(185, 28, 28) 80%,
        rgb(153, 27, 27) 100%)`,
      textColor: "black",
    },
  };

  // Use appropriate color set based on background
  const levelData = $derived(
    useDarkColors ? brightBgLevelData : defaultLevelData
  );

  // Convert DifficultyLevel to numeric value for stepper
  const levelToNumber = LEVEL_MAP;

  const numberToLevel: Record<number, DifficultyLevel> = {
    1: DifficultyLevel.BEGINNER,
    2: DifficultyLevel.INTERMEDIATE,
    3: DifficultyLevel.ADVANCED,
    4: DifficultyLevel.SKEWED,
  };

  const currentLevelNumber = $derived(
    levelToNumber[currentLevel as DifficultyLevel]
  );

  function handleIncrement() {
    // Capped at MAX_AVAILABLE_LEVEL: Level 4 (SKEWED) pictograph data does
    // not exist yet, so it must stay unreachable from this stepper.
    const newLevel = Math.min(currentLevelNumber + 1, MAX_AVAILABLE_LEVEL);
    onLevelChange(numberToLevel[newLevel]);
  }

  function handleDecrement() {
    const newLevel = Math.max(currentLevelNumber - 1, 1);
    onLevelChange(numberToLevel[newLevel]);
  }

  function formatValue(value: number): string {
    return value.toString();
  }

  function getDescription(value: number): string {
    const level = numberToLevel[value];
    if (!level) return "Unknown";
    const data = levelData[level];
    return data.name;
  }

  function getColor(value: number): string {
    const level = numberToLevel[value];
    if (!level) return "var(--semantic-info)";
    const data = levelData[level];
    return data.color;
  }

  function getTextColor(value: number): string {
    const level = numberToLevel[value];
    if (!level) return "white";
    const data = levelData[level];
    return data.textColor;
  }

  const description = $derived(getDescription(currentLevelNumber));
  const color = $derived(getColor(currentLevelNumber));
  const textColor = $derived(getTextColor(currentLevelNumber));
</script>

<StepperCard
  title={t("generator_level")}
  currentValue={currentLevelNumber}
  minValue={1}
  maxValue={MAX_AVAILABLE_LEVEL}
  onIncrement={handleIncrement}
  onDecrement={handleDecrement}
  {formatValue}
  {description}
  {color}
  {textColor}
  shadowColor="0deg 0% 0%"
  {gridColumnSpan}
  {cardIndex}
  {headerFontSize}
  {appearance}
/>
