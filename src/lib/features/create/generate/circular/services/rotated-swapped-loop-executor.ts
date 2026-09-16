/**
 * Rotated Swapped LOOP Executor
 *
 * Executes the rotated-swapped LOOP (Linked Orbital Offset Pattern) by combining:
 * 1. SWAPPED: Blue does what Red did, Red does what Blue did
 * 2. ROTATED: Rotate locations based on handpath direction (90°, 180°, or 270°)
 *
 * This creates a sequence where:
 * - Colors are swapped (Blue performs Red's actions and vice versa)
 * - Locations are rotated based on the handpath direction of each color's motion
 * - Motion types stay the same (from opposite color due to swap)
 * - Prop rotation directions stay the same (from opposite color due to swap)
 * - Letters stay the same
 *
 * IMPORTANT: Supports both quartered and halved slice sizes
 * IMPORTANT: End placement is calculated from rotated locations
 */

import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  getHandRotationDirection,
  getLocationMapForHandRotation,
} from "../domain/constants/circular-placement-maps";
import {
  ROTATED_SWAPPED_QUARTERED_VALIDATION_SET,
  ROTATED_SWAPPED_HALVED_VALIDATION_SET,
} from "../domain/constants/strict-loop-placement-maps";
import { Period } from "../domain/models/circular-models";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class RotatedSwappedLOOPExecutor {
  constructor() {}

  /**
   * Execute the rotated-swapped LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - Slice size for the LOOP (quartered or halved)
   * @returns The complete circular sequence with all steps
   */
  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    // Validate the sequence
    this._validateSequence(sequence, period);

    // Remove start placement (index 0) for processing
    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    // Calculate how many steps to generate based on slice size
    const sequenceLength = sequence.length;
    let entriesToAdd: number;

    if (period === Period.QUARTERED) {
      // Quartered adds 3x the original length
      entriesToAdd = sequenceLength * 3;
    } else {
      // Halved adds 1x the original length (doubles total)
      entriesToAdd = sequenceLength;
    }

    // Generate the new steps
    const generatedSteps: StepData[] = [];
    let lastStep = sequence[sequence.length - 1]!;
    let nextStepNumber = lastStep.stepNumber + 1;

    // Skip first two steps in the loop (start from step 2)
    const finalIntendedLength = sequenceLength + entriesToAdd;
    for (let i = 0; i < entriesToAdd; i++) {
      const nextStep = this._createNewLOOPEntry(
        sequence,
        lastStep,
        nextStepNumber,
        finalIntendedLength,
        period
      );

      generatedSteps.push(nextStep);
      sequence.push(nextStep);
      lastStep = nextStep;
      nextStepNumber++;
    }

    // Re-insert start placement at the beginning
    sequence.unshift(startPlacement);

    return sequence;
  }

  /**
   * Validate that the sequence can perform a rotated-swapped LOOP
   */
  private _validateSequence(sequence: StepData[], period: Period): void {
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

    // Check if the (start, end) pair is valid for the requested slice size.
    // The end placement must be SWAPPED(ROTATED(start)) — both the rotation AND
    // the color swap move the placement, so pure-rotation sets are insufficient.
    // Matches the canonical LOOPValidator and the UI's loop-validator.
    const key = `${startPos},${endPos}`;
    const validationSet =
      period === Period.QUARTERED
        ? ROTATED_SWAPPED_QUARTERED_VALIDATION_SET
        : ROTATED_SWAPPED_HALVED_VALIDATION_SET;

    if (!validationSet.has(key)) {
      throw new Error(
        `Invalid placement pair for rotated-swapped ${period} LOOP: ${startPos} → ${endPos}. ` +
          `The end placement must equal SWAPPED(ROTATED(${startPos})) for the ${period} slice size.`
      );
    }
  }

  /**
   * Create a new LOOP entry by transforming a previous step with SWAP + ROTATION
   */
  private _createNewLOOPEntry(
    sequence: StepData[],
    previousStep: StepData,
    stepNumber: number,
    finalIntendedLength: number,
    period: Period
  ): StepData {
    // Get the corresponding step from the first section using index mapping
    const previousMatchingStep = this._getPreviousMatchingBeat(
      sequence,
      stepNumber,
      finalIntendedLength,
      period
    );

    // Calculate the rotated end placement
    const rotatedEndPlacement = this._getRotatedEndPlacement(
      previousStep,
      previousMatchingStep
    );

    // Create the new step with swapped and rotated attributes
    // KEY: Blue gets attributes from Red's matching step (SWAP)
    //      Red gets attributes from Blue's matching step (SWAP)
    //      Then locations are rotated based on handpath direction
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: previousMatchingStep.letter ?? null, // Same letter
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: rotatedEndPlacement,
      motions: {
        // SWAP: Blue does what Red did, but with rotated transformation
        [HandSide.LEFT]: this._createRotatedSwappedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep,
          true // isSwapped = true (use opposite color's data)
        ),
        // SWAP: Red does what Blue did, but with rotated transformation
        [HandSide.RIGHT]: this._createRotatedSwappedMotion(
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
   * Get the previous matching step using index mapping
   */
  private _getPreviousMatchingBeat(
    sequence: StepData[],
    stepNumber: number,
    finalLength: number,
    period: Period
  ): StepData {
    const indexMap = this._getIndexMap(finalLength, period);
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
   * Generate index mapping for retrieving corresponding steps
   * Works for both quartered and halved patterns
   */
  private _getIndexMap(
    length: number,
    period: Period
  ): Record<number, number> {
    const map: Record<number, number> = {};

    // Edge case handling
    if (period === Period.QUARTERED && length < 4) {
      for (let i = 1; i <= length; i++) {
        map[i] = Math.max(i - 1, 1);
      }
      return map;
    }

    if (period === Period.HALVED && length < 2) {
      for (let i = 1; i <= length; i++) {
        map[i] = Math.max(i - 1, 1);
      }
      return map;
    }

    if (period === Period.QUARTERED) {
      // Quartered: length = base * 4, so base = length / 4
      // Each quarter references the PREVIOUS quarter (chained rotation)
      const baseLength = Math.floor(length / 4);
      for (let i = baseLength + 1; i <= length; i++) {
        map[i] = i - baseLength;
      }
    } else {
      // Halved: length = base * 2, so base = length / 2
      const baseLength = Math.floor(length / 2);
      for (let i = baseLength + 1; i <= length; i++) {
        map[i] = i - baseLength;
      }
    }

    return map;
  }

  /**
   * Get the rotated end placement by rotating both colors' locations
   */
  private _getRotatedEndPlacement(
    previousStep: StepData,
    previousMatchingStep: StepData
  ): GridPlacement | null {
    // Get hand rotation directions from the matching step (before swap)
    // Blue will use Red's handpath (due to swap)
    // Red will use Blue's handpath (due to swap)
    const leftHandRotDir = getHandRotationDirection(
      previousMatchingStep.motions[HandSide.RIGHT]!
        .startLocation as GridLocation,
      previousMatchingStep.motions[HandSide.RIGHT]!.endLocation as GridLocation
    );
    const rightHandRotDir = getHandRotationDirection(
      previousMatchingStep.motions[HandSide.LEFT]!
        .startLocation as GridLocation,
      previousMatchingStep.motions[HandSide.LEFT]!
        .endLocation as GridLocation
    );

    // Get the location maps for rotation
    const leftLocationMap = getLocationMapForHandRotation(leftHandRotDir);
    const rightLocationMap = getLocationMapForHandRotation(rightHandRotDir);

    // Rotate the locations from the previous step
    const newLeftEndLoc =
      leftLocationMap[
        previousStep.motions[HandSide.LEFT]!.endLocation as GridLocation
      ];
    const newRightEndLoc =
      rightLocationMap[
        previousStep.motions[HandSide.RIGHT]!.endLocation as GridLocation
      ];

    // Derive placement from both locations
    const newEndPlacement =
      getGridPlacementFromLocations(
        newLeftEndLoc,
        newRightEndLoc
      );

    return newEndPlacement;
  }

  /**
   * Create rotated-swapped motion data for the new step
   * Combines color swapping with location rotation
   */
  private _createRotatedSwappedMotion(
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

    // Get hand rotation direction from the matching motion
    const handRotDir = getHandRotationDirection(
      matchingMotion.startLocation as GridLocation,
      matchingMotion.endLocation as GridLocation
    );

    // Get location map for this rotation direction
    const locationMap = getLocationMapForHandRotation(handRotDir);

    // For STATIC motions, end = start (no movement)
    // For other motions, rotate the end location
    const endLocation =
      matchingMotion.motionType === MotionType.STATIC
        ? startLocation
        : locationMap[startLocation as GridLocation];

    // Create rotated-swapped motion
    const rotatedSwappedMotion = {
      ...matchingMotion,
      color, // IMPORTANT: Preserve the color (Blue stays Blue, Red stays Red)
      motionType: matchingMotion.motionType, // Same motion type (from opposite color due to swap)
      startLocation,
      endLocation,
      rotationDirection: matchingMotion.rotationDirection, // Same rotation direction (from opposite color due to swap)
      // Start orientation will be set by OrientationCalculator
      // End orientation will be calculated by OrientationCalculator
    };

    return rotatedSwappedMotion;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const rotatedSwappedLOOPExecutor = new RotatedSwappedLOOPExecutor();
