/**
 * Config Mapper - Clean conversion between UI config and service options
 *
 * This utility provides type-safe bidirectional mapping between:
 * - UIGenerationConfig (UI state management)
 * - GenerationOptions (service layer)
 *
 * Eliminates the need for manual conversion functions and provides
 * a single source of truth for all config transformations.
 */

import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { PropType as PropTypeEnum } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type {
  DifficultyLevel,
  GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  DifficultyLevel as DifficultyEnum,
  PropContinuity,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import { resolveLoopConfig } from "$lib/shared/create/services/loop-type-utils";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import type {
  GenerationMotionTypeFilter,
  GenerationStyleAxis,
} from "$lib/shared/create/domain/generation-style";
import {
  DEFAULT_HAND_RELATIONSHIP,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";

/**
 * Map difficulty level number to DifficultyLevel enum
 */
export const LEVEL_TO_DIFFICULTY: Record<number, DifficultyLevel> = {
  1: DifficultyEnum.BEGINNER,
  2: DifficultyEnum.INTERMEDIATE,
  3: DifficultyEnum.ADVANCED,
  4: DifficultyEnum.SKEWED,
} as const;

/**
 * Map DifficultyLevel enum to level number (reverse lookup)
 */
export const DIFFICULTY_TO_LEVEL: Record<DifficultyLevel, number> = {
  [DifficultyEnum.BEGINNER]: 1,
  [DifficultyEnum.INTERMEDIATE]: 2,
  [DifficultyEnum.ADVANCED]: 3,
  [DifficultyEnum.SKEWED]: 4,
} as const;

/**
 * Convert level number to DifficultyLevel enum
 */
export function levelToDifficulty(level: number): DifficultyLevel {
  return LEVEL_TO_DIFFICULTY[level] || DifficultyEnum.INTERMEDIATE;
}

/**
 * Convert DifficultyLevel enum to level number
 */
export function difficultyToLevel(difficulty: DifficultyLevel): number {
  return DIFFICULTY_TO_LEVEL[difficulty] || 2;
}

/**
 * Highest generate-UI level currently backed by real pictograph data.
 *
 * Level 4 (SKEWED) is a real difficulty already wired through
 * LEVEL_TO_DIFFICULTY / DIFFICULTY_TO_LEVEL and the generation engine, but
 * Level 4 pictograph data does not exist yet — nothing may offer it as a
 * selectable option or build against it. This is the one place that gate
 * lives: bump it to 4 when the data ships and every UI stepper/selector that
 * reads it unlocks automatically.
 */
export const MAX_AVAILABLE_LEVEL = 3;

/**
 * Clamp a level number (fresh input, persisted localStorage/Firestore state,
 * or anything in between) into the range the UI can currently offer. Use
 * this anywhere a level value re-enters the app from outside the current
 * session so a value saved before the Level 4 gate existed degrades to the
 * nearest available level instead of round-tripping into a build request the
 * generator can't fulfill.
 */
export function clampToAvailableLevel(level: number): number {
  if (!Number.isFinite(level)) return MAX_AVAILABLE_LEVEL;
  return Math.min(MAX_AVAILABLE_LEVEL, Math.max(1, Math.round(level)));
}

/**
 * UI Configuration interface for state management
 * This is what the UI components work with directly
 */
export interface UIGenerationConfig {
  mode: string; // "freeform" | "spell"
  loopEnabled: boolean; // Orthogonal toggle - works in both freeform and spell modes
  length: number;
  level: number; // 1-4
  turnIntensity: number;
  gridMode: GridMode;
  propContinuity: string; // "continuous" | "random" - legacy, derived from constraintPreset for backwards compat
  period: string; // "halved" | "quartered"
  loopType: string; // LOOP type when loopEnabled=true

  // Per-component rhythm overrides (P3 UI sets these; absent = today's
  // behavior — rotation at `period`'s interval, inversion halved, expand mode).
  inversionInterval?: 2 | 4;
  inversionMode?: "expand" | "overlay";
  reflectionAxis?: ReflectionAxis;

  // 3-axis constraint system (replaces binary propContinuity)
  constraintPreset: GenerationStyleAxis; // Prop reversal frequency
  handPathMode: GenerationStyleAxis; // Hand path reversal frequency
  motionTypeFilter: GenerationMotionTypeFilter; // Dash frequency ("mixed" = null)

  // Hand relationship (Generate only, not part of GenerationStylePolicy)
  handRelationship: HandRelationship;
  handRelationshipInverted: boolean;
  matchHandTurns: boolean;

  // Duration rhythm template (applied automatically after generation)
  durationTemplateId: string | null;

  // Spell mode length override (null = use natural expanded length)
  spellTargetLength: number | null;
}

/**
 * Convert UI config to service-layer GenerationOptions
 * This is the main conversion function used when calling the generation service
 *
 * @param uiConfig - The UI generation configuration
 * @param propType - The prop type to use (defaults to FAN)
 * @param startEndOptions - Optional start/end position constraints
 */
export function uiConfigToGenerationOptions(
  uiConfig: UIGenerationConfig,
  propType: PropType = PropTypeEnum.FAN,
  startEndOptions?: StartEndOptions | null
): GenerationOptions {
  // Canonical loop-config resolution (single source of truth): coerces
  // quartered→halved for non-rotation types (period-4 viability is authoritative
  // in ROTATED_LOOP_TYPES) and builds the compositional wire-form spec so the
  // orchestrator divides length by the TRUE expander multiplier, not the raw
  // 2/4. Combos with no implemented mapping yield an undefined wire and fall
  // back to the legacy type+period path in the orchestrator, unchanged. Shared
  // with every deck/preview generation path via resolveLoopConfig so none of
  // them can skip these guards (the "asked for 16, got 8/32" deck bug).
  const resolvedLoop =
    uiConfig.loopEnabled && uiConfig.loopType
      ? resolveLoopConfig(uiConfig.loopType, uiConfig.period, {
          inversionInterval: uiConfig.inversionInterval,
          inversionMode: uiConfig.inversionMode,
          reflectionAxis: uiConfig.reflectionAxis,
          handRelationship: uiConfig.handRelationship,
        })
      : undefined;
  const period = resolvedLoop?.period ?? uiConfig.period;
  const loopRhythm = resolvedLoop?.loopRhythm;
  const loopSpecWire = resolvedLoop?.loopSpecWire;

  // Derive propContinuity from constraintPreset for backwards compat
  const derivedPropContinuity =
    uiConfig.constraintPreset === "smooth"
      ? PropContinuity.CONTINUOUS
      : PropContinuity.RANDOM;

  // When loop is enabled, use the circular generation pipeline; otherwise freeform
  const effectiveMode = uiConfig.loopEnabled ? "circular" : "freeform";

  const options: GenerationOptions = {
    length: uiConfig.length,
    gridMode: uiConfig.gridMode,
    propType,
    difficulty: levelToDifficulty(uiConfig.level),
    mode: effectiveMode
      ? (effectiveMode as GenerationOptions["mode"])
      : undefined,
    propContinuity: derivedPropContinuity,
    turnIntensity:
      uiConfig.turnIntensity !== undefined ? uiConfig.turnIntensity : undefined,
    period: period ? (period as GenerationOptions["period"]) : undefined,
    loopType: uiConfig.loopType
      ? (uiConfig.loopType as GenerationOptions["loopType"])
      : undefined,
    loopSpecWire,
    loopRhythm,

    // 3-axis constraint system
    constraintPreset: uiConfig.constraintPreset ?? undefined,
    handPathMode: uiConfig.handPathMode ?? undefined,
    motionTypeFilter: uiConfig.motionTypeFilter ?? undefined,
    handRelationship: uiConfig.handRelationship ?? DEFAULT_HAND_RELATIONSHIP,
    handRelationshipInverted: uiConfig.handRelationshipInverted ?? false,
    matchHandTurns: uiConfig.matchHandTurns ?? false,

    // Include start/end options if provided
    blockedStartPositions: startEndOptions?.blockedStartPositions ?? undefined,
    startPosition: startEndOptions?.startPosition ?? undefined,
    endPosition: startEndOptions?.endPosition ?? undefined,
    endPositions: startEndOptions?.endPositions ?? undefined,
    mustContainLetters: startEndOptions?.mustContainLetters ?? undefined,
    mustNotContainLetters: startEndOptions?.mustNotContainLetters ?? undefined,

    // Start orientation overrides (engine seeds step 0 + propagates). Orientation
    // values are already engine strings ("in"/"clock"/"out"/"counter").
    leftStartOrientation: startEndOptions?.leftStartOrientation ?? undefined,
    rightStartOrientation: startEndOptions?.rightStartOrientation ?? undefined,
  };
  return options;
}

/**
 * Convert service-layer GenerationOptions back to UI config
 * Useful for loading saved configurations
 */
export function generationOptionsToUIConfig(
  options: GenerationOptions,
  period: string = "halved",
  loopType: string = "rotated"
): UIGenerationConfig {
  // Derive constraintPreset from propContinuity for backwards compat
  const constraintPreset: UIGenerationConfig["constraintPreset"] =
    options.constraintPreset ??
    (options.propContinuity === "random" ? "mixed" : "smooth");

  // Map "circular" back to freeform + loopEnabled for the UI
  const isCircular = options.mode === "circular";
  return {
    mode: isCircular ? "freeform" : options.mode || "freeform",
    loopEnabled: isCircular,
    length: options.length,
    level: difficultyToLevel(options.difficulty),
    turnIntensity: options.turnIntensity || 1.0,
    gridMode: options.gridMode,
    propContinuity: options.propContinuity || "continuous",
    period,
    loopType,
    constraintPreset,
    handPathMode: options.handPathMode ?? "mixed",
    motionTypeFilter: options.motionTypeFilter ?? null,
    handRelationship: options.handRelationship ?? DEFAULT_HAND_RELATIONSHIP,
    handRelationshipInverted: options.handRelationshipInverted ?? false,
    matchHandTurns: options.matchHandTurns ?? false,
    durationTemplateId: null,
    spellTargetLength: null,
    inversionInterval: options.loopRhythm?.inversionInterval,
    inversionMode: options.loopRhythm?.inversionMode,
    reflectionAxis: options.loopRhythm?.reflectionAxis,
  };
}
