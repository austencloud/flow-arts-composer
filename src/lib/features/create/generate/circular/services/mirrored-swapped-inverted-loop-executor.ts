/**
 * Mirrored Swapped Inverted LOOP Executor
 *
 * Executes the mirrored-swapped-inverted LOOP (Linked Orbital Offset Pattern) by combining:
 * 1. MIRRORED: Mirror locations vertically (E↔W)
 * 2. SWAPPED: Blue does what Red did, Red does what Blue did
 * 3. INVERTED: Flip letters (A↔B), flip motion types (PRO↔ANTI)
 *
 * NOTE: While each transformation individually affects rotation, when all three are
 * combined together, the rotation direction is PRESERVED.
 *
 * This creates a sequence where:
 * - Colors are swapped (Blue performs Red's actions and vice versa)
 * - Letters are flipped (A ↔ B)
 * - Motion types are flipped (PRO ↔ ANTI)
 * - Locations are mirrored vertically across the north-south axis
 * - **Prop rotation directions stay THE SAME** (SWAP + INVERTED + MIRRORED preserve rotation)
 *
 * IMPORTANT: Slice size is ALWAYS halved (no quartering)
 * IMPORTANT: End placement must RETURN TO START PLACEMENT (inverted effect)
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import type { LOOPParameterProvider } from "$lib/features/create/generate/shared/services/loop-parameter-provider";
import {
  INVERTED_LOOP_VALIDATION_SET,
  VERTICAL_MIRROR_LOCATION_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
} from "../domain/constants/strict-loop-placement-maps";
import type { Period } from "../domain/models/circular-models";
import type { ILOOPExecutor } from "./ILOOPExecutor";

export class MirroredSwappedInvertedLOOPExecutor implements ILOOPExecutor {
  constructor(
    private loopParams: LOOPParameterProvider
  ) {}

  /**
   * Execute the mirrored-swapped-inverted LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param _period - Ignored (mirrored-swapped-inverted LOOP always uses halved)
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
   * Validate that the sequence can perform a mirrored-swapped-inverted LOOP
   * Requirement: end_placement must equal start_placement (inverted returns to start)
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

    // Check if the (start, end) pair is valid for inverted (returns to same placement)
    const key = `${startPos},${endPos}`;

    if (!INVERTED_LOOP_VALIDATION_SET.has(key)) {
      throw new Error(
        `Invalid placement pair for mirrored-swapped-inverted LOOP: ${startPos} → ${endPos}. ` +
          `For a mirrored-swapped-inverted LOOP, the end placement must return to the start placement (${startPos}).`
      );
    }
  }

  /**
   * Create a new LOOP entry by transforming a previous step with MIRROR + SWAP + INVERTED
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

    // Get the inverted letter (INVERTED effect)
    if (!previousMatchingStep.letter) {
      throw new Error("Previous matching step must have a letter");
    }
    const invertedLetter = this.loopParams.getInvertedLetter(
      previousMatchingStep.letter as string
    ) as Letter;

    // Get the mirrored end placement (MIRRORED effect)
    const mirroredEndPlacement = this._getMirroredPlacement(previousMatchingStep);

    // Create the new step with swapped, mirrored, and inverted attributes
    // KEY: Blue gets attributes from Red's matching step (SWAP)
    //      Red gets attributes from Blue's matching step (SWAP)
    //      Motion types are flipped (INVERTED)
    //      Letters are flipped (INVERTED)
    //      Locations and rotations are mirrored (MIRRORED)
    //      Rotation direction flipped once (3 flips total = odd = net flip)
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: invertedLetter, // INVERTED: Flip letter
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: mirroredEndPlacement, // MIRRORED: Flip placement
      motions: {
        // SWAP: Blue does what Red did, with mirrored+inverted transformation
        [HandSide.LEFT]: this._createMirroredSwappedInvertedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep,
          true // isSwapped = true (use opposite color's data)
        ),
        // SWAP: Red does what Blue did, with mirrored+inverted transformation
        [HandSide.RIGHT]: this._createMirroredSwappedInvertedMotion(
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
   * Get the vertical mirrored placement
   */
  private _getMirroredPlacement(
    previousMatchingStep: StepData
  ): GridPlacement | null {
    const endPos = previousMatchingStep.endPlacement;

    if (!endPos) {
      throw new Error("Previous matching step must have an end placement");
    }

    const mirroredPlacement = VERTICAL_MIRROR_PLACEMENT_MAP[endPos];

    return mirroredPlacement;
  }

  /**
   * Create mirrored-swapped-inverted motion data for the new step
   * Combines color swapping with location mirroring, inverted motion types, and rotation flipping
   * **IMPORTANT**: Rotation direction is flipped (3 transformations = odd number of flips)
   */
  private _createMirroredSwappedInvertedMotion(
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

    // Flip the motion type (INVERTED effect)
    const invertedMotionType = this._getInvertedMotionType(
      matchingMotion.motionType
    );

    // For STATIC motions, end = start (no movement)
    // For other motions, mirror the end location vertically
    const endLocation =
      invertedMotionType === MotionType.STATIC
        ? startLocation
        : this._getMirroredLocation(matchingMotion.endLocation);

    // Rotation direction stays the SAME for all motion types
    // SWAP + INVERTED + MIRRORED together preserve the rotation direction
    const finalPropRotDir = matchingMotion.rotationDirection;

    // Create mirrored-swapped-inverted motion
    const mirroredSwappedInvertedMotion = {
      ...matchingMotion,
      color, // IMPORTANT: Preserve the color (Blue stays Blue, Red stays Red)
      motionType: invertedMotionType, // INVERTED: Flip motion type
      startLocation,
      endLocation, // MIRRORED: Flip location (or same as start for STATIC)
      rotationDirection: finalPropRotDir, // Conditional: No flip for shifts, flip for dashes
      // Start orientation will be set by OrientationCalculator
      // End orientation will be calculated by OrientationCalculator
    };

    return mirroredSwappedInvertedMotion;
  }

  /**
   * Mirror a location vertically (flip east/west)
   */
  private _getMirroredLocation(location: GridLocation): GridLocation {
    const mirrored = VERTICAL_MIRROR_LOCATION_MAP[location];

    return mirrored;
  }

  /**
   * Get the inverted motion type (flip PRO ↔ ANTI)
   * STATIC and DASH stay the same
   */
  private _getInvertedMotionType(motionType: MotionType): MotionType {
    if (motionType === MotionType.PRO) {
      return MotionType.ANTI;
    } else if (motionType === MotionType.ANTI) {
      return MotionType.PRO;
    }

    // STATIC and DASH stay the same
    return motionType;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { loopParameterProvider } from "$lib/features/create/generate/shared/services/loop-parameter-provider";

export const mirroredSwappedInvertedLOOPExecutor = new MirroredSwappedInvertedLOOPExecutor(
  loopParameterProvider
);
