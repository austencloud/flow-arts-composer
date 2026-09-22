/**
 * Random Sequence Generator Implementation
 *
 * Generates single random valid sequences using constraint-based random walks.
 * Fast alternative to exhaustive exploration.
 */

import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { VariationConstraints } from "../domain/models/spell-models";
import type { RandomSequenceGenerationOptions } from "./types";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { StartPlacementValidator } from "./start-placement-validator";
import type { OrientationContinuityValidator } from "./orientation-continuity-validator";
import type { SequenceExtender } from "../../shared/services/sequence-extender";
import type { stepConverter as StepConverterSingleton } from "$lib/features/create/generate/shared/services/step-converter";
type StepConverter = typeof StepConverterSingleton;
import type { ReversalDetector } from "$lib/shared/create/services/reversal-detector";
import type { LOOPEndPlacementResolver } from "./loop-end-placement-resolver";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type {
  ConstraintSet,
  ConstraintStep,
  ConstraintPictographData,
} from "$lib/shared/sequence-engine/constraints/types";
import {
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";

interface RandomWalkState {
  steps: StepData[];
  pictographs: PictographData[];
  letterIndex: number;
  startPlacementPictograph: PictographData;
  /** Track previous steps for constraint scoring (reversals, continuity) */
  previousConstraintSteps: ConstraintStep[];
  /** Valid candidate options at each step index (for backtracking) */
  candidatesPerStep: PictographData[][];
  /** Which candidate index was chosen at each step (for backtracking) */
  chosenIndicesPerStep: number[];
}

export class RandomSequenceGenerator {
  constructor(
    private letterQueryHandler: ILetterQueryHandler,
    private startPlacementValidator: StartPlacementValidator,
    private orientationContinuityValidator: OrientationContinuityValidator,
    private sequenceExtender: SequenceExtender,
    private stepConverter: StepConverter,
    private reversalDetector: ReversalDetector,
    private loopEndPlacementResolver: LOOPEndPlacementResolver
  ) {}

  async generateRandomSequence(
    letters: Letter[],
    options: RandomSequenceGenerationOptions
  ): Promise<SequenceData | null> {
    const {
      gridMode,
      constraints,
      constraintSet,
      signal,
      maxAttempts = 100,
      level,
      turnIntensity,
    } = options;

    if (letters.length === 0) {
      return null;
    }

    // Try multiple times to find a valid sequence
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        return null;
      }

      try {
        const sequence = await this.attemptRandomGeneration(
          letters,
          gridMode,
          constraints,
          constraintSet,
          signal,
          options.letterSources,
          level,
          turnIntensity
        );

        if (sequence) {
          return sequence;
        }
      } catch (error) {
        // If there are no valid start placements, retrying won't help
        if (
          error instanceof Error &&
          error.message.includes("No valid start placements")
        ) {
          console.error(
            `[RandomSequenceGenerator] Cannot generate sequence: ${error.message}`
          );
          return null;
        }

        console.warn(
          `[RandomSequenceGenerator] Attempt ${attempt + 1} failed:`,
          error
        );
        // Continue to next attempt for other errors
      }
    }

    console.error(
      `[RandomSequenceGenerator] Failed to generate valid sequence after ${maxAttempts} attempts`
    );
    return null;
  }

  private async attemptRandomGeneration(
    letters: Letter[],
    gridMode: GridMode,
    constraints?: VariationConstraints,
    constraintSet?: ConstraintSet,
    signal?: AbortSignal,
    letterSources?: Array<{
      letter: Letter;
      isOriginal: boolean;
      stepIndex: number;
    }>,
    level?: DifficultyLevel,
    turnIntensity?: number
  ): Promise<SequenceData | null> {
    // Get ALL pictograph variations for this grid mode (cached by letterQueryHandler)
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Get the first letter of the word
    const firstLetter = letters[0];
    if (!firstLetter) return null;

    // Step 1: Pick a random variation of the first letter (filtered by level)
    let firstLetterVariations = allPictographs.filter(
      (p: PictographData) => p.letter === firstLetter
    );

    // Apply level-based turn filtering to first letter candidates
    if (level) {
      const levelFiltered = firstLetterVariations.filter((p) =>
        this.meetsLevelTurnLimit(p, level)
      );
      // Only apply filter if it leaves at least one option
      if (levelFiltered.length > 0) {
        firstLetterVariations = levelFiltered;
      }
    }

    if (firstLetterVariations.length === 0) {
      return null;
    }

    // Apply turn intensity biasing to first letter selection
    const firstLetterVariation =
      turnIntensity != null
        ? this.selectWithTurnBias(firstLetterVariations, turnIntensity)
        : this.pickRandom(firstLetterVariations);
    if (!firstLetterVariation) return null;

    // Step 2: Get where that variation starts (e.g., "alpha3")
    const requiredStartPlacement = firstLetterVariation.startPlacement;

    // Step 3: Validate that a Type 6 static letter exists at that placement
    // (The start placement will be derived, not stored as a beat)
    const validStartPlacements = allPictographs.filter((p) => {
      return (
        this.startPlacementValidator.isValidStartPlacement(p) &&
        p.startPlacement === requiredStartPlacement &&
        p.endPlacement === requiredStartPlacement
      );
    });

    if (validStartPlacements.length === 0) {
      console.warn(
        `[RandomSequenceGenerator] No Type 6 static letter found at placement ${requiredStartPlacement} for letter ${firstLetter}`
      );
      return null;
    }

    // Pick a random start placement (Type 6 static letter)
    const startPlacementPictograph = this.pickRandom(validStartPlacements);
    if (!startPlacementPictograph) return null;

    // Step 4: Convert first letter variation to beat 1
    const firstLetterStep = this.stepConverter.convertToStep(
      firstLetterVariation,
      1,
      gridMode
    );

    // Convert first letter variation to ConstraintStep for soft constraint scoring
    const firstConstraintStep =
      this.pictographToConstraintStep(firstLetterVariation);

    // Compute valid LOOP end placements if a non-REWOUND LOOP type is selected
    let validEndPlacements: GridPlacement[] = [];
    if (
      constraints?.requiresCircular &&
      constraints?.loopType &&
      constraints.loopType !== LOOPType.STRICT_REWOUND
    ) {
      const startPos = startPlacementPictograph.startPlacement as GridPlacement;
      validEndPlacements = this.loopEndPlacementResolver.getValidEndPlacements(
        startPos,
        constraints.loopType
      );
    }

    // For single-letter words with LOOP constraint, filter first letter by end placement
    if (letters.length === 1 && validEndPlacements.length > 0) {
      const endPosMatches = validEndPlacements.includes(
        firstLetterVariation.endPlacement as GridPlacement
      );
      if (!endPosMatches) {
        // First letter doesn't end at a valid LOOP placement - abort this attempt
        return null;
      }
    }

    // Initialize walk state with first letter and start placement
    const state: RandomWalkState = {
      steps: [firstLetterStep],
      pictographs: [firstLetterVariation],
      letterIndex: 1, // Start from second letter (index 1) since first is already placed
      startPlacementPictograph,
      previousConstraintSteps: [firstConstraintStep],
      candidatesPerStep: [], // Index 0 = first letter (not tracked for backtracking)
      chosenIndicesPerStep: [],
    };

    // Walk through remaining letters with LOOP-aware end placement constraint
    while (state.letterIndex < letters.length) {
      if (signal?.aborted) {
        return null;
      }

      const isLastLetter = state.letterIndex === letters.length - 1;
      const endPlacementFilter =
        isLastLetter && validEndPlacements.length > 0
          ? validEndPlacements
          : undefined;

      const success = this.walkNextLetter(
        letters,
        state,
        gridMode,
        allPictographs,
        constraints,
        constraintSet,
        endPlacementFilter,
        level,
        turnIntensity
      );

      if (!success && isLastLetter && validEndPlacements.length > 0) {
        // Last letter failed with LOOP constraint - try backtracking
        const backtrackSuccess = this.backtrackAndRetry(
          letters,
          state,
          gridMode,
          allPictographs,
          constraints,
          constraintSet,
          validEndPlacements,
          3, // max backtrack depth
          level,
          turnIntensity
        );
        if (backtrackSuccess) break; // Walk complete
      }

      if (!success) {
        return null; // Failed to find valid next step
      }

      state.letterIndex++;
    }

    // Build final sequence with proper start placement for orientation propagation
    const sequence = this.buildSequence(
      state.steps,
      gridMode,
      state.startPlacementPictograph,
      letterSources
    );

    // Apply LOOP extension if circular is required
    if (constraints?.requiresCircular && !sequence.isCircular) {
      const extended = await this.applyCircularExtension(
        sequence,
        constraints,
        letterSources
      );
      return extended || sequence;
    }

    return sequence;
  }

  private walkNextLetter(
    letters: Letter[],
    state: RandomWalkState,
    gridMode: GridMode,
    allPictographs: PictographData[],
    constraints?: VariationConstraints,
    constraintSet?: ConstraintSet,
    requiredEndPlacements?: GridPlacement[],
    level?: DifficultyLevel,
    turnIntensity?: number
  ): boolean {
    const letter = letters[state.letterIndex];
    if (!letter) return false;

    const lastPictograph = state.pictographs[state.pictographs.length - 1];
    if (!lastPictograph) return false;

    // Get all variations for this letter
    const variations = allPictographs.filter((p) => p.letter === letter);

    // Filter by placement continuity, constraints, and level
    const lastEndPlacement = lastPictograph.endPlacement;

    let validOptions = variations.filter((pictograph) => {
      // Check placement continuity: next beat must start where last beat ended
      const nextStartPlacement = pictograph.startPlacement;

      if (lastEndPlacement !== nextStartPlacement) {
        return false; // Placement break - invalid transition
      }

      // Apply constraints
      if (!this.meetsConstraints(pictograph, constraints)) {
        return false;
      }

      // Apply level-based turn filtering
      if (level && !this.meetsLevelTurnLimit(pictograph, level)) {
        return false;
      }

      return true;
    });

    // Apply LOOP end placement filter for the last letter
    if (requiredEndPlacements && requiredEndPlacements.length > 0) {
      validOptions = validOptions.filter((p) =>
        requiredEndPlacements.includes(p.endPlacement as GridPlacement)
      );
    }

    if (validOptions.length === 0) {
      return false; // No valid options - this path is blocked
    }

    // Track candidates for backtracking
    state.candidatesPerStep.push(validOptions);

    // Use constraint-weighted selection if soft constraints are provided
    const chosenPictograph = this.selectWithConstraints(
      validOptions,
      state.previousConstraintSteps,
      constraintSet,
      constraints,
      turnIntensity
    );
    if (!chosenPictograph) return false;

    // Track which candidate was chosen (by index in validOptions)
    const chosenIndex = validOptions.indexOf(chosenPictograph);
    state.chosenIndicesPerStep.push(chosenIndex);

    // Convert to step and add to state
    const step = this.stepConverter.convertToStep(
      chosenPictograph,
      state.steps.length + 1,
      gridMode
    );

    state.steps.push(step);
    state.pictographs.push(chosenPictograph);

    // Track this step for constraint scoring in next iteration
    const constraintStep = this.pictographToConstraintStep(chosenPictograph);
    state.previousConstraintSteps.push(constraintStep);

    return true;
  }

  /**
   * Backtrack up to `maxDepth` steps and re-walk forward, trying different
   * variation choices at each depth to find a path where the last letter
   * ends at a valid LOOP placement.
   *
   * At each depth d (1..maxDepth):
   *   1. Pop d steps from state (steps, pictographs, constraintSteps, candidates, chosen)
   *   2. For each previously-unchosen alternative at the new last popped step, try:
   *      a. Re-place that step with the alternative
   *      b. Re-walk forward from there through remaining letters
   *      c. If the last letter succeeds with the end placement constraint, return true
   *   3. If all alternatives exhausted at this depth, try next depth
   *
   * Returns true if a valid path was found (state is updated in place).
   * Returns false if all depths exhausted (state is in an inconsistent mid-pop state -
   * caller should discard this attempt).
   */
  private backtrackAndRetry(
    letters: Letter[],
    state: RandomWalkState,
    gridMode: GridMode,
    allPictographs: PictographData[],
    constraints: VariationConstraints | undefined,
    constraintSet: ConstraintSet | undefined,
    validEndPlacements: GridPlacement[],
    maxDepth: number,
    level?: DifficultyLevel,
    turnIntensity?: number
  ): boolean {
    // Save snapshot so we can restore if needed
    const snapshotSteps = [...state.steps];
    const snapshotPictographs = [...state.pictographs];
    const snapshotConstraintSteps = [...state.previousConstraintSteps];
    const snapshotCandidates = [...state.candidatesPerStep];
    const snapshotChosen = [...state.chosenIndicesPerStep];
    const snapshotLetterIndex = state.letterIndex;

    for (let depth = 1; depth <= maxDepth; depth++) {
      // Restore to snapshot before trying this depth
      state.steps = [...snapshotSteps];
      state.pictographs = [...snapshotPictographs];
      state.previousConstraintSteps = [...snapshotConstraintSteps];
      state.candidatesPerStep = [...snapshotCandidates];
      state.chosenIndicesPerStep = [...snapshotChosen];
      state.letterIndex = snapshotLetterIndex;

      // Can't backtrack further than we have steps (excluding first letter at index 0)
      // candidatesPerStep tracks steps from letterIndex=1 onward
      if (depth > state.candidatesPerStep.length) break;

      // Pop `depth` steps
      for (let i = 0; i < depth; i++) {
        state.steps.pop();
        state.pictographs.pop();
        state.previousConstraintSteps.pop();
        state.letterIndex--;
      }

      // Get alternatives at the backtrack point
      const backtrackCandidateIndex = state.candidatesPerStep.length - depth;
      const candidatesAtBacktrack =
        state.candidatesPerStep[backtrackCandidateIndex];
      const previouslyChosen =
        state.chosenIndicesPerStep[backtrackCandidateIndex];

      // Trim candidates/chosen tracking to the backtrack point
      state.candidatesPerStep = state.candidatesPerStep.slice(
        0,
        backtrackCandidateIndex
      );
      state.chosenIndicesPerStep = state.chosenIndicesPerStep.slice(
        0,
        backtrackCandidateIndex
      );

      if (!candidatesAtBacktrack || candidatesAtBacktrack.length <= 1) {
        // No alternatives at this depth
        continue;
      }

      // Build list of alternative indices, shuffled for randomness
      const alternativeIndices = candidatesAtBacktrack
        .map((_, i) => i)
        .filter((i) => i !== previouslyChosen);
      this.shuffleArray(alternativeIndices);

      for (const altIndex of alternativeIndices) {
        const altPictograph = candidatesAtBacktrack[altIndex];
        if (!altPictograph) continue;

        // Save state at backtrack point before trying this alternative
        const btSteps = [...state.steps];
        const btPictos = [...state.pictographs];
        const btConstraint = [...state.previousConstraintSteps];
        const btCandidates = [...state.candidatesPerStep];
        const btChosen = [...state.chosenIndicesPerStep];
        const btLetterIdx = state.letterIndex;

        // Place the alternative
        const step = this.stepConverter.convertToStep(
          altPictograph,
          state.steps.length + 1,
          gridMode
        );
        state.steps.push(step);
        state.pictographs.push(altPictograph);
        state.previousConstraintSteps.push(
          this.pictographToConstraintStep(altPictograph)
        );
        state.candidatesPerStep.push(candidatesAtBacktrack);
        state.chosenIndicesPerStep.push(altIndex);
        state.letterIndex++;

        // Re-walk forward through remaining letters
        let forwardSuccess = true;
        while (state.letterIndex < letters.length) {
          const isLastLetter = state.letterIndex === letters.length - 1;
          const endFilter =
            isLastLetter && validEndPlacements.length > 0
              ? validEndPlacements
              : undefined;

          const walked = this.walkNextLetter(
            letters,
            state,
            gridMode,
            allPictographs,
            constraints,
            constraintSet,
            endFilter,
            level,
            turnIntensity
          );

          if (!walked) {
            forwardSuccess = false;
            break;
          }
          state.letterIndex++;
        }

        if (forwardSuccess) {
          return true; // Found a valid path
        }

        // Restore to backtrack point and try next alternative
        state.steps = btSteps;
        state.pictographs = btPictos;
        state.previousConstraintSteps = btConstraint;
        state.candidatesPerStep = btCandidates;
        state.chosenIndicesPerStep = btChosen;
        state.letterIndex = btLetterIdx;
      }
    }

    return false; // All depths exhausted
  }

  /** Fisher-Yates shuffle (in-place) */
  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
  }

  private meetsConstraints(
    pictograph: PictographData,
    constraints?: VariationConstraints
  ): boolean {
    if (!constraints) return true;

    // Motion type filter - only "no-dash" is a hard constraint
    // "prefer-dash" is a soft preference handled in selectWithConstraints
    if (constraints.motionTypeFilter === "no-dash") {
      const hasDash = this.hasDashMotion(pictograph);
      if (hasDash) {
        return false;
      }
    }

    // Note: We can't check reversal count or step count on individual pictographs
    // Those are sequence-level constraints checked after generation completes

    return true;
  }

  /**
   * Check if a pictograph's turns fall within the level's allowed range.
   * BEGINNER: 0-turn only
   * INTERMEDIATE: 0 and 1 turn
   * ADVANCED/SKEWED: all turns allowed (including half-turns and floats)
   */
  private meetsLevelTurnLimit(
    pictograph: PictographData,
    level: DifficultyLevel
  ): boolean {
    const leftMotion = pictograph.motions[HandSide.LEFT];
    const rightMotion = pictograph.motions[HandSide.RIGHT];

    const leftTurns = leftMotion?.turns ?? 0;
    const rightTurns = rightMotion?.turns ?? 0;

    switch (level) {
      case DifficultyLevel.BEGINNER:
        // 0-turn only (no floats)
        return leftTurns === 0 && rightTurns === 0;
      case DifficultyLevel.INTERMEDIATE:
        // 0 and 1 turn (no floats, no half-turns)
        return (
          (leftTurns === 0 || leftTurns === 1) &&
          (rightTurns === 0 || rightTurns === 1)
        );
      case DifficultyLevel.ADVANCED:
      case DifficultyLevel.SKEWED:
        // All turns allowed including half-turns and floats
        return true;
      default:
        return true;
    }
  }

  /**
   * Select a candidate biased by turn intensity.
   * intensity < 1.0 → favor lower turns
   * intensity > 1.0 → favor higher turns
   * intensity === 1.0 → uniform random
   */
  private selectWithTurnBias(
    candidates: PictographData[],
    turnIntensity: number
  ): PictographData | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0] ?? null;

    // intensity of 1.0 means no bias
    if (Math.abs(turnIntensity - 1.0) < 0.01) {
      return this.pickRandom(candidates);
    }

    const weights = candidates.map((c) => {
      const maxTurns = this.getMaxTurns(c);
      // Higher intensity → exponentially favor higher turns
      // Lower intensity → exponentially favor lower turns
      // Base weight of 1 ensures all candidates have nonzero chance
      return 1 + Math.pow(maxTurns + 0.5, turnIntensity);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i]!;
      if (random <= 0) {
        return candidates[i] ?? null;
      }
    }

    return candidates[candidates.length - 1] ?? null;
  }

  /**
   * Get the maximum turn count across both hands of a pictograph.
   * Floats are treated as 0.25 for scoring purposes (low rotation).
   */
  private getMaxTurns(pictograph: PictographData): number {
    const leftMotion = pictograph.motions[HandSide.LEFT];
    const rightMotion = pictograph.motions[HandSide.RIGHT];

    const leftTurns =
      leftMotion?.turns === "fl" ? 0.25 : (leftMotion?.turns ?? 0);
    const rightTurns =
      rightMotion?.turns === "fl" ? 0.25 : (rightMotion?.turns ?? 0);

    return Math.max(leftTurns, rightTurns);
  }

  private hasDashMotion(pictograph: PictographData): boolean {
    const leftMotion = pictograph.motions[HandSide.LEFT];
    const rightMotion = pictograph.motions[HandSide.RIGHT];

    return (
      leftMotion?.motionType === MotionType.DASH ||
      rightMotion?.motionType === MotionType.DASH
    );
  }

  /**
   * Convert a pictograph to the ConstraintStep format used for scoring.
   */
  private pictographToConstraintStep(
    pictograph: PictographData
  ): ConstraintStep {
    const leftMotion = pictograph.motions[HandSide.LEFT];
    const rightMotion = pictograph.motions[HandSide.RIGHT];

    return {
      letter: pictograph.letter ?? "",
      leftMotionType: leftMotion?.motionType ?? "static",
      rightMotionType: rightMotion?.motionType ?? "static",
      leftPropRotation: leftMotion?.rotationDirection ?? "cw",
      rightPropRotation: rightMotion?.rotationDirection ?? "cw",
      startPlacement: pictograph.startPlacement ?? "",
      endPlacement: pictograph.endPlacement ?? "",
      // Location data for hand path constraint
      leftStartLocation: leftMotion?.startLocation ?? "",
      leftEndLocation: leftMotion?.endLocation ?? "",
      rightStartLocation: rightMotion?.startLocation ?? "",
      rightEndLocation: rightMotion?.endLocation ?? "",
    };
  }

  /**
   * Convert a pictograph to the ConstraintPictographData format for constraint evaluation.
   */
  private pictographToConstraintPictograph(
    pictograph: PictographData
  ): ConstraintPictographData {
    const leftMotion = pictograph.motions[HandSide.LEFT];
    const rightMotion = pictograph.motions[HandSide.RIGHT];

    return {
      letter: pictograph.letter ?? "",
      startPlacement: pictograph.startPlacement ?? "",
      endPlacement: pictograph.endPlacement ?? "",
      timing: "", // PictographData doesn't have timing - only available on compound letters
      direction: "", // PictographData doesn't have direction - only available on compound letters
      leftMotion: {
        color: "left",
        startLocation: leftMotion?.startLocation ?? "",
        endLocation: leftMotion?.endLocation ?? "",
        motionType: leftMotion?.motionType ?? "static",
        rotationDirection: leftMotion?.rotationDirection ?? "cw",
        startOrientation: leftMotion?.startOrientation ?? "",
        endOrientation: leftMotion?.endOrientation ?? "",
      },
      rightMotion: {
        color: "right",
        startLocation: rightMotion?.startLocation ?? "",
        endLocation: rightMotion?.endLocation ?? "",
        motionType: rightMotion?.motionType ?? "static",
        rotationDirection: rightMotion?.rotationDirection ?? "cw",
        startOrientation: rightMotion?.startOrientation ?? "",
        endOrientation: rightMotion?.endOrientation ?? "",
      },
    };
  }

  /**
   * Convert a ConstraintStep to ConstraintPictographData for constraint evaluation.
   */
  private constraintStepToConstraintPictograph(
    step: ConstraintStep
  ): ConstraintPictographData {
    return {
      letter: step.letter,
      startPlacement: step.startPlacement,
      endPlacement: step.endPlacement,
      timing: "",
      direction: "",
      leftMotion: {
        color: "left",
        startLocation: step.leftStartLocation ?? "",
        endLocation: step.leftEndLocation ?? "",
        motionType: step.leftMotionType,
        rotationDirection: step.leftPropRotation,
        startOrientation: "",
        endOrientation: "",
      },
      rightMotion: {
        color: "right",
        startLocation: step.rightStartLocation ?? "",
        endLocation: step.rightEndLocation ?? "",
        motionType: step.rightMotionType,
        rotationDirection: step.rightPropRotation,
        startOrientation: "",
        endOrientation: "",
      },
    };
  }

  /**
   * Select a candidate using weighted scoring based on soft constraints.
   * If no constraintSet is provided, falls back to random selection.
   * Also applies preference boosts (e.g., prefer-dash).
   */
  private selectWithConstraints(
    candidates: PictographData[],
    previousSteps: ConstraintStep[],
    constraintSet?: ConstraintSet,
    variationConstraints?: VariationConstraints,
    turnIntensity?: number
  ): PictographData | null {
    if (candidates.length === 0) return null;

    const preferDash = variationConstraints?.motionTypeFilter === "prefer-dash";

    // If prefer-dash is on, filter to only dash options when available
    if (preferDash) {
      const dashCandidates = candidates.filter((c) => this.hasDashMotion(c));
      if (dashCandidates.length > 0) {
        // Use only dash candidates for the rest of selection
        candidates = dashCandidates;
      }
      // If no dash candidates exist, fall through to use all candidates
    }

    // Check if we need to apply any scoring
    const hasSoftConstraints =
      constraintSet?.soft && constraintSet.soft.length > 0;
    const hasTurnBias =
      turnIntensity != null && Math.abs(turnIntensity - 1.0) >= 0.01;

    // No soft constraints and no turn bias - use pure random selection
    if (!hasSoftConstraints && !hasTurnBias) {
      return this.pickRandom(candidates);
    }

    // No soft constraints but has turn bias - use turn bias only
    if (!hasSoftConstraints && hasTurnBias) {
      return this.selectWithTurnBias(candidates, turnIntensity!);
    }

    // Score each candidate based on soft constraints
    const scored = candidates.map((candidate, _index) => {
      const candidatePictograph =
        this.pictographToConstraintPictograph(candidate);
      const previousPictographs = previousSteps.map((step) =>
        this.constraintStepToConstraintPictograph(step)
      );

      let score = 0;

      for (const constraint of constraintSet!.soft!) {
        // Build ConstraintContext for the evaluate method
        const context = {
          stepIndex: previousSteps.length,
          totalSteps: previousSteps.length + 1,
          previousSteps: previousPictographs,
          candidate: candidatePictograph,
          letter: candidate.letter ?? "",
        };

        const result = constraint.evaluate(context);
        const weight = constraintSet!.weights?.get(constraint.type) ?? 1;
        score += result.score * weight;
      }

      // Apply turn intensity bias to the constraint score
      if (hasTurnBias) {
        const maxTurns = this.getMaxTurns(candidate);
        // Add a turn-based bonus: higher intensity favors higher turns
        score += Math.pow(maxTurns + 0.5, turnIntensity!) * 0.5;
      }

      return { candidate, score };
    });

    // Weighted random selection based on scores
    // Convert scores to positive weights (higher score = better = higher weight)
    const minScore = Math.min(...scored.map((s) => s.score));
    const weights = scored.map((s) => ({
      candidate: s.candidate,
      weight: Math.max(0.01, s.score - minScore + 1), // Ensure positive weights
    }));

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { candidate, weight } of weights) {
      random -= weight;
      if (random <= 0) {
        return candidate;
      }
    }

    // Fallback to last candidate (shouldn't happen with proper weights)
    return candidates[candidates.length - 1] ?? null;
  }

  private buildSequence(
    steps: StepData[],
    gridMode: GridMode,
    startPlacementPictograph: PictographData,
    letterSources?: Array<{
      letter: Letter;
      isOriginal: boolean;
      stepIndex: number;
    }>
  ): SequenceData {
    // Extract word from step letters
    const word = deriveWordFromBeats(steps);

    // Convert the start placement pictograph to StartPlacementData
    const startPlacement = this.stepConverter.convertToStartPlacement(
      startPlacementPictograph,
      gridMode
    );

    // Create the initial sequence with start placement
    let sequence = createSequenceData({
      steps,
      name: word,
      word: word,
      gridMode,
      isCircular: false,
      startPlacement,
      metadata: {
        generatedAt: new Date().toISOString(),
        generationMethod: "random-walk",
        // Include spellData with letterSources if provided
        ...(letterSources && {
          spellData: {
            letterSources,
          },
        }),
      },
    });

    // Recalculate all orientations using proper propagation
    // This uses the start placement's end orientations as the baseline
    // and calculates each step's end orientation based on motion type
    sequence = recalculateAllOrientations(sequence);

    // Detect and apply reversal markers
    sequence = this.reversalDetector.processReversals(sequence);

    return sequence;
  }

  private async applyCircularExtension(
    sequence: SequenceData,
    constraints?: VariationConstraints,
    letterSources?: Array<{
      letter: Letter;
      isOriginal: boolean;
      stepIndex: number;
    }>
  ): Promise<SequenceData | null> {
    if (!constraints?.requiresCircular) return sequence;

    try {
      // Use specified LOOP type, or default to REWOUND
      const loopType = constraints.loopType ?? LOOPType.STRICT_REWOUND;
      const originalStepCount = sequence.steps?.length ?? 0;

      // Get existing letterSources - prefer passed-in sources, fall back to metadata
      const existingSpellData = sequence.metadata?.spellData as
        | {
            letterSources?: Array<{
              letter: Letter;
              isOriginal: boolean;
              stepIndex: number;
            }>;
          }
        | undefined;
      const existingLetterSources =
        letterSources ?? existingSpellData?.letterSources ?? [];

      const extended = await this.sequenceExtender.extendSequence(sequence, {
        loopType,
      });

      if (!extended) return sequence;

      // Build updated word and letterSources from the extended sequence
      // The extender has already derived correct letters for each step
      const extendedWord =
        extended.word || deriveWordFromBeats(extended.steps ?? []);

      // Build letterSources: preserve isOriginal from existing sources for first half,
      // mark LOOP-generated steps (second half) as not original
      const extendedLetterSources =
        extended.steps?.map((step, index) => {
          // For original steps, preserve the existing isOriginal flag (handles bridge letters)
          if (index < originalStepCount && existingLetterSources[index]) {
            return {
              letter: (step.letter || "") as Letter,
              isOriginal: existingLetterSources[index].isOriginal,
              stepIndex: index + 1,
            };
          }
          // For LOOP-extended steps, they are never "original"
          return {
            letter: (step.letter || "") as Letter,
            isOriginal: false,
            stepIndex: index + 1,
          };
        }) || [];

      // Update metadata with spellData
      return {
        ...extended,
        word: extendedWord,
        metadata: {
          ...extended.metadata,
          spellData: {
            originalWord: sequence.word || "",
            expandedWord: extendedWord,
            letterSources: extendedLetterSources,
            appliedLOOPType: loopType,
          },
        },
      };
    } catch (error) {
      console.error(
        "[RandomSequenceGenerator] Failed to apply circular extension:",
        error
      );
      return sequence;
    }
  }

  private pickRandom<T>(items: T[]): T | null {
    if (items.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex] ?? null;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { startPlacementValidator } from "./start-placement-validator";
import * as orientationContinuityValidator from "./orientation-continuity-validator";
import { sequenceExtender } from "$lib/features/create/shared/services/sequence-extender";
import { stepConverter } from "$lib/features/create/generate/shared/services/step-converter";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import * as loopEndPlacementResolver from "./loop-end-placement-resolver";

export const randomSequenceGenerator = new RandomSequenceGenerator(
  letterQueryHandler,
  startPlacementValidator,
  orientationContinuityValidator,
  sequenceExtender,
  stepConverter,
  reversalDetector,
  loopEndPlacementResolver
);
