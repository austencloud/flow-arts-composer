/**
 * Sequence Feature Extractor Service Implementation
 *
 * Extracts analyzable features from sequences for rule-based tagging.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { Step } from "@tka/tka-types";
import type { SequenceAnalyzer } from "../../create/shared/services/sequence-analyzer";
import type { StrictLoopType } from "../../create/shared/services/sequence-analyzer";
import type {
  SequenceFeatures,
  PositionDominance,
  ReversalAnalysis,
} from "../domain/models/sequence-features";
import { createDefaultSequenceFeatures } from "../domain/models/sequence-features";
import {
  GridPlacementGroup,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

export class SequenceFeatureExtractor {
  constructor(private readonly SequenceAnalyzer: SequenceAnalyzer) {}

  /**
   * Extract all analyzable features from a sequence
   */
  extractFeatures(sequence: SequenceData): SequenceFeatures {
    if (!sequence.steps || sequence.steps.length === 0) {
      return createDefaultSequenceFeatures();
    }

    const validSteps = this.getValidBeats(sequence);
    if (validSteps.length === 0) {
      return createDefaultSequenceFeatures();
    }

    // Use existing SequenceAnalyzer for circularity
    const circularity = this.SequenceAnalyzer.analyzeCircularity(sequence);

    // Use existing loopType from sequence if available (authoritative label from LOOP labeler)
    // Only fall back to detection if no loopType exists
    const detectedCapTypes = this.getDetectedCapTypes(sequence);

    // Analyze turns (pro/anti spin)
    const turnAnalysis = this.analyzeTurns(validSteps);

    // Collect which motion types are present
    const motionTypes = this.collectMotionTypes(validSteps);

    // Analyze positions
    const positionDominance = this.calculatePositionDominance(sequence);
    const positionPresence = this.analyzePositionPresence(validSteps);

    return {
      stepCount: validSteps.length,
      // propType removed - prop type is viewer preference, not sequence data
      gridMode: sequence.gridMode ?? null,
      circularity,
      detectedCapTypes,
      reversals: this.analyzeReversals(sequence),
      positionDominance,
      hasAlphaPositions: positionPresence.hasAlpha,
      hasBetaPositions: positionPresence.hasBeta,
      hasGammaPositions: positionPresence.hasGamma,
      hasTurns: turnAnalysis.hasTurns,
      turnStepCount: turnAnalysis.turnStepCount,
      hasProMotion: motionTypes.has(MotionType.PRO),
      hasAntiMotion: motionTypes.has(MotionType.ANTI),
      hasFloatMotion: motionTypes.has(MotionType.FLOAT),
      hasDashMotion: motionTypes.has(MotionType.DASH),
      hasStaticMotion: motionTypes.has(MotionType.STATIC),
    };
  }

  /**
   * Get detected LOOP types, preferring existing loopType from sequence data
   *
   * The loopType field is the authoritative label set by the LOOP labeler.
   * We parse it to extract the base StrictLoopType(s) for tagging.
   */
  private getDetectedCapTypes(
    sequence: SequenceData
  ): readonly StrictLoopType[] {
    // If sequence has an authoritative loopType, parse it
    if (sequence.loopType) {
      return this.parseCapTypeToStrictTypes(sequence.loopType);
    }

    // Fall back to detection (may have bugs, but better than nothing)
    return this.SequenceAnalyzer.detectCompletedLoopTypes(sequence);
  }

  /**
   * Parse a LOOPType string to extract base StrictLoopType(s)
   *
   * LOOPType values like "rotated_quartered", "mirrored",
   * "mirrored_swapped", etc. are parsed to extract the base transformations.
   */
  private parseCapTypeToStrictTypes(
    loopType: string
  ): readonly StrictLoopType[] {
    const loopTypeLower = loopType.toLowerCase();
    const types: StrictLoopType[] = [];

    // Check for rotated (covers "rotated", "rotated_quartered", "rotated_*", etc.)
    if (
      loopTypeLower.includes("rotated") ||
      loopTypeLower.includes("rotation")
    ) {
      types.push("rotated");
    }

    // Check for mirrored (covers "mirrored", "mirrored_*", etc.)
    if (
      loopTypeLower.includes("mirrored") ||
      loopTypeLower.includes("mirror")
    ) {
      types.push("mirrored");
    }

    // Check for static patterns (inverted without rotation/mirroring, or swapped alone)
    if (
      (loopTypeLower.includes("inverted") ||
        loopTypeLower.includes("swapped")) &&
      !types.includes("rotated") &&
      !types.includes("mirrored")
    ) {
      types.push("static");
    }

    // If we found both rotated and mirrored, also add the combined type
    if (types.includes("rotated") && types.includes("mirrored")) {
      // Replace with the combined type
      return ["rotated-mirrored"] as const;
    }

    // If nothing matched but it's a LOOP type, default to static
    if (types.length === 0 && loopTypeLower.includes("strict")) {
      types.push("static");
    }

    return types;
  }

  /**
   * Analyze reversals in a sequence
   */
  analyzeReversals(sequence: SequenceData): ReversalAnalysis {
    const validSteps = this.getValidBeats(sequence);

    const leftReversalSteps: number[] = [];
    const rightReversalSteps: number[] = [];

    for (const step of validSteps) {
      if (step.leftReversal) {
        leftReversalSteps.push(step.stepNumber);
      }
      if (step.rightReversal) {
        rightReversalSteps.push(step.stepNumber);
      }
    }

    const leftReversalCount = leftReversalSteps.length;
    const rightReversalCount = rightReversalSteps.length;
    const totalReversals = leftReversalCount + rightReversalCount;

    // Check if reversals are synchronized (occur at same steps)
    const synchronizedReversals =
      leftReversalCount > 0 &&
      leftReversalCount === rightReversalCount &&
      leftReversalSteps.every((step) => rightReversalSteps.includes(step));

    return {
      leftReversalCount,
      rightReversalCount,
      totalReversals,
      hasReversals: totalReversals > 0,
      synchronizedReversals,
      leftReversalSteps,
      rightReversalSteps,
    };
  }

  /**
   * Calculate position group dominance
   */
  calculatePositionDominance(sequence: SequenceData): PositionDominance {
    const validSteps = this.getValidBeats(sequence);

    if (validSteps.length === 0) {
      return {
        primaryGroup: null,
        alphaPercent: 0,
        betaPercent: 0,
        gammaPercent: 0,
        isAlphaHeavy: false,
        isBetaHeavy: false,
        isGammaHeavy: false,
        isBalanced: true,
      };
    }

    let alphaCount = 0;
    let betaCount = 0;
    let gammaCount = 0;
    let totalPositions = 0;

    for (const step of validSteps) {
      // Count start positions
      if (step.startPlacement) {
        const group = this.getPlacementGroup(step.startPlacement);
        this.incrementGroupCount(
          group,
          () => alphaCount++,
          () => betaCount++,
          () => gammaCount++
        );
        totalPositions++;
      }

      // Count end positions
      if (step.endPlacement) {
        const group = this.getPlacementGroup(step.endPlacement);
        this.incrementGroupCount(
          group,
          () => alphaCount++,
          () => betaCount++,
          () => gammaCount++
        );
        totalPositions++;
      }
    }

    if (totalPositions === 0) {
      return {
        primaryGroup: null,
        alphaPercent: 0,
        betaPercent: 0,
        gammaPercent: 0,
        isAlphaHeavy: false,
        isBetaHeavy: false,
        isGammaHeavy: false,
        isBalanced: true,
      };
    }

    const alphaPercent = Math.round((alphaCount / totalPositions) * 100);
    const betaPercent = Math.round((betaCount / totalPositions) * 100);
    const gammaPercent = Math.round((gammaCount / totalPositions) * 100);

    const isAlphaHeavy = alphaPercent > 50;
    const isBetaHeavy = betaPercent > 50;
    const isGammaHeavy = gammaPercent > 50;

    // Balanced if no single group exceeds 40%
    const isBalanced =
      alphaPercent <= 40 && betaPercent <= 40 && gammaPercent <= 40;

    // Determine primary group
    let primaryGroup: GridPlacementGroup | null = null;
    if (alphaCount >= betaCount && alphaCount >= gammaCount && alphaCount > 0) {
      primaryGroup = GridPlacementGroup.ALPHA;
    } else if (
      betaCount >= alphaCount &&
      betaCount >= gammaCount &&
      betaCount > 0
    ) {
      primaryGroup = GridPlacementGroup.BETA;
    } else if (gammaCount > 0) {
      primaryGroup = GridPlacementGroup.GAMMA;
    }

    return {
      primaryGroup,
      alphaPercent,
      betaPercent,
      gammaPercent,
      isAlphaHeavy,
      isBetaHeavy,
      isGammaHeavy,
      isBalanced,
    };
  }

  /**
   * Analyze which position groups are present in the sequence
   */
  analyzePositionPresence(steps: readonly Step[]): {
    hasAlpha: boolean;
    hasBeta: boolean;
    hasGamma: boolean;
  } {
    let hasAlpha = false;
    let hasBeta = false;
    let hasGamma = false;

    for (const step of steps) {
      if (step.startPlacement) {
        const group = this.getPlacementGroup(step.startPlacement);
        if (group === GridPlacementGroup.ALPHA) hasAlpha = true;
        if (group === GridPlacementGroup.BETA) hasBeta = true;
        if (group === GridPlacementGroup.GAMMA) hasGamma = true;
      }
      if (step.endPlacement) {
        const group = this.getPlacementGroup(step.endPlacement);
        if (group === GridPlacementGroup.ALPHA) hasAlpha = true;
        if (group === GridPlacementGroup.BETA) hasBeta = true;
        if (group === GridPlacementGroup.GAMMA) hasGamma = true;
      }

      // Early exit if all found
      if (hasAlpha && hasBeta && hasGamma) break;
    }

    return { hasAlpha, hasBeta, hasGamma };
  }

  /**
   * Analyze turns (prop rotations) in a sequence
   *
   * Turns are PRO or ANTI motion types where the prop actually rotates.
   * FLOAT, DASH, and STATIC don't count as turns.
   */
  analyzeTurns(steps: readonly Step[]): {
    hasTurns: boolean;
    turnStepCount: number;
  } {
    let turnStepCount = 0;

    for (const step of steps) {
      if (step.motions) {
        const leftMotion = step.motions[HandSide.LEFT];
        const rightMotion = step.motions[HandSide.RIGHT];

        // Check if either hand has a turn (pro or anti)
        const leftHasTurn =
          leftMotion?.motionType === MotionType.PRO ||
          leftMotion?.motionType === MotionType.ANTI;
        const rightHasTurn =
          rightMotion?.motionType === MotionType.PRO ||
          rightMotion?.motionType === MotionType.ANTI;

        if (leftHasTurn || rightHasTurn) {
          turnStepCount++;
        }
      }
    }

    return {
      hasTurns: turnStepCount > 0,
      turnStepCount,
    };
  }


  private getValidBeats(sequence: SequenceData): StepData[] {
    if (!sequence.steps) {
      return [];
    }
    return sequence.steps.filter((step) => !step.isBlank);
  }

  private getPlacementGroup(position: GridPlacement): GridPlacementGroup | null {
    const posStr = position.toString().toLowerCase();

    if (posStr.startsWith("alpha")) {
      return GridPlacementGroup.ALPHA;
    }
    if (posStr.startsWith("beta")) {
      return GridPlacementGroup.BETA;
    }
    if (posStr.startsWith("gamma")) {
      return GridPlacementGroup.GAMMA;
    }

    return null;
  }

  private incrementGroupCount(
    group: GridPlacementGroup | null,
    incAlpha: () => void,
    incBeta: () => void,
    incGamma: () => void
  ): void {
    switch (group) {
      case GridPlacementGroup.ALPHA:
        incAlpha();
        break;
      case GridPlacementGroup.BETA:
        incBeta();
        break;
      case GridPlacementGroup.GAMMA:
        incGamma();
        break;
    }
  }

  private collectMotionTypes(steps: StepData[]): Set<MotionType> {
    const types = new Set<MotionType>();

    for (const step of steps) {
      if (step.motions) {
        const leftMotion = step.motions[HandSide.LEFT];
        const rightMotion = step.motions[HandSide.RIGHT];

        if (leftMotion?.motionType) {
          types.add(leftMotion.motionType);
        }
        if (rightMotion?.motionType) {
          types.add(rightMotion.motionType);
        }
      }
    }

    return types;
  }
}
