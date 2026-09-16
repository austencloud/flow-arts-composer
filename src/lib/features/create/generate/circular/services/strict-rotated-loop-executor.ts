/**
 * Strict Rotated LOOP Executor
 *
 * Executes the strict rotated LOOP (Linked Orbital Offset Pattern) by:
 * 1. Taking a partial sequence (first half or quarter)
 * 2. Applying rotational transformations to each step
 * 3. Generating the remaining steps to complete the circular pattern
 *
 * The rotation works by:
 * - Taking each pictograph from the first section
 * - Rotating its hand locations based on the hand's rotation direction
 * - Maintaining the same motion types, turns, and letter patterns
 * - Creating new steps that fit the rotated placements
 */

import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  HALVED_LOOPS,
  QUARTERED_LOOPS,
  getHandRotationDirection,
  getLocationMapForHandRotation,
} from "../domain/constants/circular-placement-maps";
import { Period } from "../domain/models/circular-models";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class StrictRotatedLOOPExecutor {
  constructor() {}

  /**
   * Execute the strict rotated LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - Whether to use halved (180°) or quartered (90°) rotation
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

    // Calculate how many steps to generate
    const sequenceLength = sequence.length;
    const entriesToAdd = this._calculateEntriesToAdd(sequenceLength, period);

    // Generate the new steps
    const generatedSteps: StepData[] = [];
    let lastStep = sequence[sequence.length - 1]!;
    let nextStepNumber = lastStep.stepNumber + 1;

    for (let i = 0; i < entriesToAdd; i++) {
      const finalIntendedLength = sequenceLength + entriesToAdd;
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
   * Validate that the sequence can perform the requested LOOP
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

    // Check if the (start, end) pair is valid for the slice size
    const key = `${startPos},${endPos}`;
    const validationSet =
      period === Period.HALVED ? HALVED_LOOPS : QUARTERED_LOOPS;

    if (!validationSet.has(key)) {
      throw new Error(
        `Invalid placement pair for ${period} LOOP: ${startPos} → ${endPos}. ` +
          `This pair cannot complete a ${period} rotation.`
      );
    }
  }

  /**
   * Calculate how many steps need to be added based on slice size
   */
  private _calculateEntriesToAdd(
    sequenceLength: number,
    period: Period
  ): number {
    if (period === Period.HALVED) {
      return sequenceLength; // Double the sequence
    }
    // Period.QUARTERED
    return sequenceLength * 3; // Quadruple the sequence
  }

  /**
   * Create a new LOOP entry by transforming a previous step
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

    // Calculate new end placement
    const newEndPlacement = this._calculateNewEndPlacement(
      previousMatchingStep,
      previousStep
    );

    // Create the new step with transformed attributes
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: newEndPlacement,
      motions: {
        [HandSide.LEFT]: this._createTransformedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep
        ),
        [HandSide.RIGHT]: this._createTransformedMotion(
          HandSide.RIGHT,
          previousStep,
          previousMatchingStep
        ),
      },
    };

    // Update orientations
    const stepWithStartOri = updateStartOrientations(newStep, previousStep);
    const finalStep = updateEndOrientations(stepWithStartOri);

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
    const indexMap = this._getIndexMap(period, finalLength);
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
   */
  private _getIndexMap(period: Period, length: number): Record<number, number> {
    // Handle edge cases for very short sequences
    if (length < 4 && period === Period.QUARTERED) {
      const map: Record<number, number> = {};
      for (let i = 1; i <= length; i++) {
        map[i] = Math.max(i - 1, 1);
      }
      return map;
    }

    if (length < 2 && period === Period.HALVED) {
      const map: Record<number, number> = {};
      for (let i = 1; i <= length; i++) {
        map[i] = Math.max(i - 1, 1);
      }
      return map;
    }

    // Normal index mapping
    const map: Record<number, number> = {};

    if (period === Period.QUARTERED) {
      const quarterLength = Math.floor(length / 4);
      for (let i = quarterLength + 1; i <= length; i++) {
        map[i] = i - quarterLength;
      }
    } else {
      // Period.HALVED
      const halfLength = Math.floor(length / 2);
      for (let i = halfLength + 1; i <= length; i++) {
        map[i] = i - halfLength;
      }
    }

    return map;
  }

  /**
   * Calculate the new end placement by rotating locations
   */
  private _calculateNewEndPlacement(
    previousMatchingStep: StepData,
    previousStep: StepData
  ): GridPlacement | null {
    const leftMotion = previousMatchingStep.motions[HandSide.LEFT];
    const rightMotion = previousMatchingStep.motions[HandSide.RIGHT];

    if (!leftMotion || !rightMotion) {
      throw new Error(
        "Previous matching step must have both left and right motions"
      );
    }

    // Get hand rotation directions
    const leftHandRotDir = getHandRotationDirection(
      leftMotion.startLocation as GridLocation,
      leftMotion.endLocation as GridLocation
    );
    const rightHandRotDir = getHandRotationDirection(
      rightMotion.startLocation as GridLocation,
      rightMotion.endLocation as GridLocation
    );

    // Get location maps
    const leftLocationMap = getLocationMapForHandRotation(leftHandRotDir);
    const rightLocationMap = getLocationMapForHandRotation(rightHandRotDir);

    // Calculate new end locations
    const previousLeftEndLoc = previousStep.motions[HandSide.LEFT]!.endLocation;
    const previousRightEndLoc =
      previousStep.motions[HandSide.RIGHT]!.endLocation;

    const newLeftEndLoc = leftLocationMap[previousLeftEndLoc as GridLocation];
    const newRightEndLoc =
      rightLocationMap[previousRightEndLoc as GridLocation];

    // Derive GridPlacement from (blue, red) location tuple using GridPlacementDeriver
    const newPlacement = getGridPlacementFromLocations(
      newLeftEndLoc,
      newRightEndLoc
    );

    return newPlacement;
  }

  /**
   * Create transformed motion data for the new step
   */
  private _createTransformedMotion(
    color: HandSide,
    previousStep: StepData,
    previousMatchingStep: StepData
  ): MotionData {
    const previousMotion = previousStep.motions[color];
    const matchingMotion = previousMatchingStep.motions[color];

    if (!previousMotion || !matchingMotion) {
      throw new Error(`Missing motion data for ${color}`);
    }

    // Get hand rotation direction
    const handRotDir = getHandRotationDirection(
      matchingMotion.startLocation as GridLocation,
      matchingMotion.endLocation as GridLocation
    );

    // Get the appropriate location map
    const locationMap = getLocationMapForHandRotation(handRotDir);

    // Calculate rotated end location
    const newEndLocation =
      locationMap[previousMotion.endLocation as GridLocation];

    // Create transformed motion
    return {
      ...matchingMotion,
      startLocation: previousMotion.endLocation,
      endLocation: newEndLocation,
      // Start orientation will be set by OrientationCalculator
      // End orientation will be calculated by OrientationCalculator
    };
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const strictRotatedLOOPExecutor = new StrictRotatedLOOPExecutor();
