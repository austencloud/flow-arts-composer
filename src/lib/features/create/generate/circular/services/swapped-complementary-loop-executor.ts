/**
 * Swapped Inverted LOOP Executor
 *
 * Executes the swapped-inverted LOOP (Linked Orbital Offset Pattern) by combining:
 * 1. SWAPPED: Blue does what Red did, Red does what Blue did
 * 2. INVERTED: Flip letters, flip motion types (PRO↔ANTI), flip prop rotation (CW↔CCW)
 *
 * This creates a sequence where:
 * - Colors are swapped (Blue performs Red's actions and vice versa)
 * - Letters are inverted (A↔B, D↔E, etc.)
 * - Motion types are flipped (PRO↔ANTI)
 * - Prop rotation directions are flipped (CW↔CCW)
 * - Locations stay the same (returns to starting placement)
 *
 * IMPORTANT: Slice size is ALWAYS halved (no quartering)
 * IMPORTANT: End placement must equal start placement (returns to start)
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  MotionType,
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  INVERTED_LOOP_VALIDATION_SET,
  getInvertedLetter,
} from "../domain/constants/strict-loop-placement-maps";
import type { Period } from "../domain/models/circular-models";

export class SwappedInvertedLOOPExecutor {
  constructor() {}

  /**
   * Execute the swapped-inverted LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - Ignored (swapped-inverted LOOP always uses halved)
   * @returns The complete circular sequence with all steps
   */
  executeLOOP(sequence: StepData[], _period: Period): StepData[] {
    // Validate the sequence
    this._validateSequence(sequence);

    // Remove start placement (index 0) for processing
    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    // Calculate how many steps to generate (always doubles for halved)
    const sequenceLength = sequence.length;
    const entriesToAdd = sequenceLength;

    // Generate the new steps
    const generatedSteps: StepData[] = [];
    let lastStep = sequence[sequence.length - 1]!;
    const nextStepNumber = lastStep.stepNumber + 1;

    // Skip first two steps in the loop (start from step 2)
    for (let i = 2; i < sequenceLength + 2; i++) {
      const finalIntendedLength = sequenceLength + entriesToAdd;
      const nextStep = this._createNewLOOPEntry(
        sequence,
        lastStep,
        nextStepNumber + i - 2,
        finalIntendedLength
      );

      generatedSteps.push(nextStep);
      sequence.push(nextStep);
      lastStep = nextStep;
    }

    // Re-insert start placement at the beginning
    sequence.unshift(startPlacement);

    return sequence;
  }

  /**
   * Validate that the sequence can perform a swapped-inverted LOOP
   * Requirement: end_placement === start_placement (returns to start)
   */
  private _validateSequence(sequence: StepData[]): void {
    if (sequence.length < 2) {
      throw new Error(
        "Sequence must have at least 2 steps (start placement + 1 step)"
      );
    }

    const startPos = sequence[0]!.startPlacement;
    const endPos = sequence[sequence.length - 1]!.endPlacement;

    if (!startPos || !endPos) {
      throw new Error("Sequence steps must have valid start and end placements");
    }

    // Check if the (start, end) pair is valid for swapped-inverted (must return to start)
    const key = `${startPos},${endPos}`;

    if (!INVERTED_LOOP_VALIDATION_SET.has(key)) {
      throw new Error(
        `Invalid placement pair for swapped-inverted LOOP: ${startPos} → ${endPos}. ` +
          `For a swapped-inverted LOOP, the sequence must end at the same placement it started (${startPos}).`
      );
    }
  }

  /**
   * Create a new LOOP entry by transforming a previous step with SWAP + INVERTED
   */
  private _createNewLOOPEntry(
    sequence: StepData[],
    previousStep: StepData,
    stepNumber: number,
    finalIntendedLength: number
  ): StepData {
    // Get the corresponding step from the first section using index mapping
    const previousMatchingStep = this._getPreviousMatchingBeat(
      sequence,
      stepNumber,
      finalIntendedLength
    );

    // Get inverted letter
    const invertedLetter = this._getInvertedLetter(previousMatchingStep);

    // Create the new step with swapped and inverted attributes
    // KEY: Blue gets attributes from Red's matching step (SWAP)
    //      Red gets attributes from Blue's matching step (SWAP)
    //      Then motion types and rotations are flipped (INVERTED)
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: invertedLetter, // INVERTED
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: previousMatchingStep.endPlacement ?? null, // Same as matching step (returns to start), handle undefined
      motions: {
        // SWAP: Blue does what Red did, with inverted transformation
        [HandSide.LEFT]: this._createSwappedInvertedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep,
          true // isSwapped = true (use opposite color's data)
        ),
        // SWAP: Red does what Blue did, with inverted transformation
        [HandSide.RIGHT]: this._createSwappedInvertedMotion(
          HandSide.RIGHT,
          previousStep,
          previousMatchingStep,
          true // isSwapped = true (use opposite color's data)
        ),
      },
    };

    // Update orientations
    const stepWithStartOri = updateStartOrientations(
      newStep,
      previousStep
    );
    const finalStep =
      updateEndOrientations(stepWithStartOri);

    return finalStep;
  }

  /**
   * Get the previous matching step using index mapping (halved pattern)
   */
  private _getPreviousMatchingBeat(
    sequence: StepData[],
    stepNumber: number,
    finalLength: number
  ): StepData {
    const indexMap = this._getIndexMap(finalLength);
    const matchingStepNumber = indexMap[stepNumber];

    if (matchingStepNumber === undefined) {
      throw new Error(`No index mapping found for stepNumber ${stepNumber}`);
    }

    // Convert 1-based stepNumber to 0-based array index
    const arrayIndex = matchingStepNumber - 1;

    if (arrayIndex < 0 || arrayIndex >= sequence.length) {
      throw new Error(
        `Invalid index mapping: stepNumber ${stepNumber} → matchingStepNumber ${matchingStepNumber} → arrayIndex ${arrayIndex} (sequence length: ${sequence.length})`
      );
    }

    return sequence[arrayIndex]!;
  }

  /**
   * Generate index mapping for retrieving corresponding steps (halved pattern only)
   * Maps second half steps to first half steps
   */
  private _getIndexMap(length: number): Record<number, number> {
    const map: Record<number, number> = {};
    const halfLength = Math.floor(length / 2);

    // Map steps in second half to their corresponding steps in first half
    for (let i = halfLength + 1; i <= length; i++) {
      map[i] = i - halfLength;
    }

    return map;
  }

  /**
   * Get inverted letter
   */
  private _getInvertedLetter(previousMatchingStep: StepData): Letter {
    const letter = previousMatchingStep.letter;

    if (!letter) {
      throw new Error("Previous matching step must have a letter");
    }

    const invertedLetter = getInvertedLetter(letter as string) as Letter;

    return invertedLetter;
  }

  /**
   * Create swapped-inverted motion data for the new step
   * Combines color swapping with inverted transformations
   */
  private _createSwappedInvertedMotion(
    color: HandSide,
    previousStep: StepData,
    previousMatchingStep: StepData,
    isSwapped: boolean
  ): MotionData {
    // SWAP: Get the opposite color's motion data for the PATTERN
    const oppositeColor =
      color === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;

    // For CONTINUITY: Always use same color from previous step
    // (Blue continues from where Blue ended, Red continues from where Red ended)
    // The swap affects which PATTERN to follow, not where to continue from
    const previousMotion = previousStep.motions[color];

    // For PATTERN: When swapped, this color follows the opposite color's movement pattern
    const matchingMotion = isSwapped
      ? previousMatchingStep.motions[oppositeColor]
      : previousMatchingStep.motions[color];

    if (!previousMotion || !matchingMotion) {
      throw new Error(`Missing motion data for ${color}`);
    }

    // Get start location from previous motion's end (for continuity)
    const startLocation = previousMotion.endLocation;

    // INVERTED: Flip the motion type (PRO ↔ ANTI)
    const invertedMotionType = this._getInvertedMotionType(
      matchingMotion.motionType
    );

    // For STATIC motions, end = start (no movement)
    // For other motions, keep the matching motion's end location
    const endLocation =
      invertedMotionType === MotionType.STATIC
        ? startLocation
        : matchingMotion.endLocation;

    // INVERTED: Flip the prop rotation direction
    const invertedPropRotDir = this._getInvertedPropRotDir(
      matchingMotion.rotationDirection
    );

    // Create swapped-inverted motion
    const swappedInvertedMotion = {
      ...matchingMotion,
      color, // IMPORTANT: Preserve the color (Blue stays Blue, Red stays Red)
      motionType: invertedMotionType, // Flipped
      startLocation,
      endLocation,
      rotationDirection: invertedPropRotDir, // Flipped
      // Start orientation will be set by OrientationCalculator
      // End orientation will be calculated by OrientationCalculator
    };

    return swappedInvertedMotion;
  }

  /**
   * Get inverted motion type (flip PRO ↔ ANTI)
   * Other motion types (FLOAT, DASH, STATIC) remain unchanged
   */
  private _getInvertedMotionType(motionType: MotionType): MotionType {
    if (motionType === MotionType.PRO) {
      return MotionType.ANTI;
    } else if (motionType === MotionType.ANTI) {
      return MotionType.PRO;
    }

    // FLOAT, DASH, STATIC stay the same
    return motionType;
  }

  /**
   * Get inverted prop rotation direction (flip CLOCKWISE ↔ COUNTER_CLOCKWISE)
   * NO_ROTATION stays NO_ROTATION
   */
  private _getInvertedPropRotDir(
    propRotDir: RotationDirection
  ): RotationDirection {
    if (propRotDir === RotationDirection.CLOCKWISE) {
      return RotationDirection.COUNTER_CLOCKWISE;
    } else if (propRotDir === RotationDirection.COUNTER_CLOCKWISE) {
      return RotationDirection.CLOCKWISE;
    }

    // NO_ROTATION stays NO_ROTATION
    return propRotDir;
  }
}
