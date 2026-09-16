/**
 * Infinite Sequence Generator Implementation
 *
 * Generates novel LOOP sequences for the endless spinner's "Infinite" mode.
 * Cycles through different LOOP types to showcase the variety of TKA patterns.
 *
 * Standard generation settings:
 * - Level 2 (Intermediate difficulty)
 * - 16 count (4 steps × 4 slices for quartered)
 * - Max turn 1
 * - Cycles through LOOP types: Rotated, Mirrored, Swapped, Inverted, and combinations
 */

import {
  GridMode,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  GenerationMode,
  DifficultyLevel,
  PropContinuity,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { getAllPlacements } from "$lib/features/create/generate/shared/domain/start-placement-presets";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { VERTICAL_MIRROR_PLACEMENT_MAP } from "$lib/features/create/generate/circular/domain/constants/strict-loop-placement-maps";
import type { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import type { OrientationCycleExtender } from "$lib/features/create/generate/circular/services/orientation-cycle-extender";
import type {
  GeneratedSequenceInfo,
  GenerationSettings,
} from "../domain/models/spinner-models";
import type { EndState } from "$lib/shared/landing/domain/types";
import type { SpinnerMetricsRepository } from "./spinner-metrics-repository";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * LOOP types that compose rotation + mirroring.
 * After rotation returns to home, mirroring needs vertical_mirror(start) == start
 * for the sequence to close. This is only true for placements on the N-S axis
 * (alpha1, alpha5, beta1, beta5 in diamond mode). All gamma placements fail
 * because mirroring always maps them to a different gamma placement.
 */
const REQUIRES_AXIS_SYMMETRIC_START = new Set<LOOPType>([
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
]);

/**
 * Check if a placement is on the vertical axis (self-mirroring).
 * vertical_mirror(placement) == placement for these placements.
 */
function isAxisSymmetric(placement: GridPlacement): boolean {
  return VERTICAL_MIRROR_PLACEMENT_MAP[placement] === placement;
}

/**
 * LOOP types to cycle through, ordered from simple to complex.
 * These represent the core TKA pattern transformations.
 */
const LOOP_TYPE_ROTATION: LOOPType[] = [
  // Single transformations (most common, easiest to see)
  LOOPType.ROTATED,
  LOOPType.MIRRORED,
  LOOPType.SWAPPED,
  LOOPType.INVERTED,

  // Double combinations
  LOOPType.ROTATED_SWAPPED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.SWAPPED_INVERTED,

  // Triple and quadruple (rare, complex)
  LOOPType.MIRRORED_INVERTED_ROTATED,
];

/**
 * Slice size options with their probabilities.
 * Quartered (4 slices) is more common as it produces 16-step sequences.
 */
const SLICE_OPTIONS: { slice: Period; weight: number }[] = [
  { slice: Period.QUARTERED, weight: 70 }, // 70% - 16 steps total
  { slice: Period.HALVED, weight: 30 }, // 30% - 8 steps total
];

export class InfiniteSequenceGenerator {
  private sessionCount = 0;
  private loopTypeIndex = 0;
  private generatedInfoBySequence = new WeakMap<
    SequenceData,
    GeneratedSequenceInfo
  >();

  constructor(
    private generationOrchestrator: GenerationOrchestrator,
    private metricsRepository: SpinnerMetricsRepository,
    private cycleExtender: OrientationCycleExtender
  ) {
    // Start at a random position in the rotation for variety
    this.loopTypeIndex = Math.floor(Math.random() * LOOP_TYPE_ROTATION.length);
  }

  async generateFromEndState(
    endState: EndState
  ): Promise<GeneratedSequenceInfo | null> {
    // LOOPs are self-contained (end = start), so to chain continuously,
    // constrain the NEXT loop to start at the PREVIOUS loop's end placement.
    return this.generateLOOP(endState.placement ?? undefined);
  }

  async generateInitial(): Promise<GeneratedSequenceInfo | null> {
    return this.generateLOOP();
  }

  /**
   * Generate a LOOP sequence with the current settings rotation.
   * @param targetStartPlacement - If provided, block all other placements to force this start.
   */
  private async generateLOOP(
    targetStartPlacement?: GridPlacement
  ): Promise<GeneratedSequenceInfo | null> {
    let settings = this.getNextSettings();

    // Composed mirrored+rotated LOOPs only work with axis-symmetric placements.
    // If chaining forces us to a non-axis placement, skip to the next LOOP type.
    if (REQUIRES_AXIS_SYMMETRIC_START.has(settings.loopType)) {
      if (targetStartPlacement && !isAxisSymmetric(targetStartPlacement)) {
        // Advance past this incompatible LOOP type
        settings = this.getNextSettings();
      }
    }

    // Build blocked placements list
    const allPlacements = getAllPlacements(GridMode.DIAMOND);
    let blockedStartPlacements: GridPlacement[] | undefined;

    if (targetStartPlacement) {
      // Force the target placement
      blockedStartPlacements = allPlacements.filter(
        (p) => p !== targetStartPlacement
      );
    } else if (REQUIRES_AXIS_SYMMETRIC_START.has(settings.loopType)) {
      // No target placement, but LOOP type needs axis-symmetric start.
      // Block all non-axis placements (all gamma, plus alpha3/7, beta3/7).
      blockedStartPlacements = allPlacements.filter((p) => !isAxisSymmetric(p));
    }

    try {
      const sequence = await this.generationOrchestrator.generateSequence({
        mode: GenerationMode.CIRCULAR,
        length: settings.totalSteps, // Pass total (16), generator divides by slice count
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
        difficulty: settings.difficulty,
        propContinuity: PropContinuity.CONTINUOUS,
        turnIntensity: settings.turnIntensity,
        loopType: settings.loopType,
        period: settings.period,
        ...(blockedStartPlacements && { blockedStartPlacements }),
      });

      // Extend sequence if orientations don't return to start after one pass.
      // This ensures the infinite generator always produces complete orientation cycles,
      // so the next chained sequence can safely assume starting orientation = "in".
      const extended = this.cycleExtender.extendIfNeeded(sequence);

      // Update counters
      this.sessionCount++;
      const globalIndex = await this.incrementMetricsSafely();

      // Update settings with actual beat count from extended sequence
      settings.totalSteps = extended.steps?.length ?? settings.totalSteps;

      return this.rememberGeneratedSequence({
        sequence: extended,
        generatedAt: new Date(),
        globalIndex,
        settings,
      });
    } catch (error) {
      console.warn(
        `[InfiniteSequenceGenerator] Failed to generate ${settings.loopType} LOOP, trying fallback:`,
        error
      );

      // Try a simpler LOOP type on failure, preserving the placement constraint
      return this.generateFallbackLOOP(settings, targetStartPlacement);
    }
  }

  /**
   * Fallback generation with simpler settings if the primary generation fails.
   * Preserves the target start placement constraint to maintain chain continuity.
   */
  private async generateFallbackLOOP(
    originalSettings: GenerationSettings,
    targetStartPlacement?: GridPlacement
  ): Promise<GeneratedSequenceInfo | null> {
    const fallbackSettings: GenerationSettings = {
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
      difficulty: DifficultyLevel.BEGINNER,
      turnIntensity: 0,
      baseLength: 4,
      totalSteps: 16,
    };

    const blockedStartPlacements = targetStartPlacement
      ? getAllPlacements(GridMode.DIAMOND).filter(
          (p) => p !== targetStartPlacement
        )
      : undefined;

    try {
      const sequence = await this.generationOrchestrator.generateSequence({
        mode: GenerationMode.CIRCULAR,
        length: fallbackSettings.totalSteps,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
        difficulty: fallbackSettings.difficulty,
        propContinuity: PropContinuity.CONTINUOUS,
        turnIntensity: fallbackSettings.turnIntensity,
        loopType: fallbackSettings.loopType,
        period: fallbackSettings.period,
        ...(blockedStartPlacements && { blockedStartPlacements }),
      });

      const extended = this.cycleExtender.extendIfNeeded(sequence);

      this.sessionCount++;
      const globalIndex = await this.incrementMetricsSafely();
      fallbackSettings.totalSteps =
        extended.steps?.length ?? fallbackSettings.totalSteps;

      return this.rememberGeneratedSequence({
        sequence: extended,
        generatedAt: new Date(),
        globalIndex,
        settings: fallbackSettings,
      });
    } catch (error) {
      console.error(
        "[InfiniteSequenceGenerator] Fallback generation also failed:",
        error
      );
      return null;
    }
  }

  /**
   * Get the next generation settings, cycling through LOOP types.
   */
  private getNextSettings(): GenerationSettings {
    // Get next LOOP type in rotation (guaranteed to exist via modulo)
    const loopType = LOOP_TYPE_ROTATION[this.loopTypeIndex] ?? LOOPType.ROTATED;
    this.loopTypeIndex = (this.loopTypeIndex + 1) % LOOP_TYPE_ROTATION.length;

    // Select slice size (weighted random)
    const period = this.selectWeightedPeriod();

    // Total length is 16 steps (standard)
    // The generator divides by slice count internally:
    // - Quartered: 16 / 4 = 4 base steps × 4 slices = 16 total
    // - Halved: 16 / 2 = 8 base steps × 2 slices = 16 total
    const totalSteps = 16;
    const multiplier = period === Period.QUARTERED ? 4 : 2;
    const baseLength = totalSteps / multiplier;

    return {
      loopType,
      period,
      difficulty: DifficultyLevel.INTERMEDIATE,
      turnIntensity: 1,
      baseLength,
      totalSteps,
    };
  }

  /**
   * Select a slice size using weighted random selection.
   */
  private selectWeightedPeriod(): Period {
    const totalWeight = SLICE_OPTIONS.reduce((sum, opt) => sum + opt.weight, 0);
    let random = Math.random() * totalWeight;

    for (const option of SLICE_OPTIONS) {
      random -= option.weight;
      if (random <= 0) {
        return option.slice;
      }
    }

    return Period.QUARTERED; // Default fallback
  }

  /**
   * Safely increment metrics, handling Firebase errors gracefully.
   */
  private async incrementMetricsSafely(): Promise<number> {
    try {
      return await this.metricsRepository.incrementGeneratedCount();
    } catch (error) {
      console.warn(
        "[InfiniteSequenceGenerator] Failed to update metrics:",
        error
      );
      // Return session count as fallback if Firebase fails
      return this.sessionCount;
    }
  }

  getSessionCount(): number {
    return this.sessionCount;
  }

  getInfoForSequence(
    sequence: SequenceData | null
  ): GeneratedSequenceInfo | null {
    return sequence
      ? (this.generatedInfoBySequence.get(sequence) ?? null)
      : null;
  }

  resetSessionCount(): void {
    this.sessionCount = 0;
  }

  private rememberGeneratedSequence(
    info: GeneratedSequenceInfo
  ): GeneratedSequenceInfo {
    this.generatedInfoBySequence.set(info.sequence, info);
    return info;
  }
}
