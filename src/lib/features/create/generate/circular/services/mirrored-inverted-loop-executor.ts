/**
 * Mirrored Inverted LOOP Executor
 *
 * Executes the mirrored-inverted LOOP (Linked Orbital Offset Pattern) by combining:
 * 1. MIRRORED: Mirror locations vertically (E↔W), flip prop rotation (CW↔CCW)
 * 2. INVERTED: Flip letters (A↔B), flip motion types (PRO↔ANTI), flip prop rotation (CW↔CCW)
 *
 * This creates a sequence where:
 * - Letters are flipped (inverted effect)
 * - Motion types are flipped (PRO ↔ ANTI) (inverted effect)
 * - Locations are mirrored vertically across the north-south axis (mirrored effect)
 * - **Prop rotation directions stay THE SAME** (both transformations flip rotation, so they CANCEL OUT)
 *
 * IMPORTANT: Slice size is ALWAYS halved (no quartering)
 * IMPORTANT: End placement must be vertical mirror of start placement
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
  MIRRORED_INVERTED_VALIDATION_SET,
  VERTICAL_MIRROR_LOCATION_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
} from "../domain/constants/strict-loop-placement-maps";
import type { Period } from "../domain/models/circular-models";

export class MirroredInvertedLOOPExecutor {
  constructor(
    private loopParams: LOOPParameterProvider
  ) {}

  /**
   * Execute the mirrored-inverted LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - Ignored (mirrored-inverted LOOP always uses halved)
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
   * Validate that the sequence can perform a mirrored-inverted LOOP
   * Requirement: end_placement must be vertical mirror of start_placement
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

    // Check if the (start, end) pair is valid for mirrored-inverted
    const key = `${startPos},${endPos}`;

    if (!MIRRORED_INVERTED_VALIDATION_SET.has(key)) {
      throw new Error(
        `Invalid placement pair for mirrored-inverted LOOP: ${startPos} → ${endPos}. ` +
          `For a mirrored-inverted LOOP, the end placement must be the vertical mirror of start placement.`
      );
    }
  }

  /**
   * Create a new LOOP entry by transforming a previous step with MIRROR + INVERTED
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
    if (!this.loopParams) {
      throw new Error(
        "LOOPParameterProvider is null - likely a module initialization order issue. " +
        "Check that loopParameterProvider is imported before MirroredInvertedLOOPExecutor singleton."
      );
    }
    const invertedLetter = this.loopParams.getInvertedLetter(
      previousMatchingStep.letter as string
    ) as Letter;

    // Get the mirrored end placement (MIRRORED effect)
    const mirroredEndPlacement = this._getMirroredPlacement(previousMatchingStep);

    // Create the new step with mirrored-inverted attributes
    // KEY: Motion type is flipped (INVERTED)
    //      Locations are mirrored (MIRRORED)
    //      Rotation direction STAYS THE SAME (both transformations flip, so they cancel)
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: invertedLetter, // INVERTED: Flip letter
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: mirroredEndPlacement, // MIRRORED: Flip placement
      motions: {
        [HandSide.LEFT]: this._createMirroredInvertedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep
        ),
        [HandSide.RIGHT]: this._createMirroredInvertedMotion(
          HandSide.RIGHT,
          previousStep,
          previousMatchingStep
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

    const mirroredPlacement =
      VERTICAL_MIRROR_PLACEMENT_MAP[endPos as GridPlacement];

    return mirroredPlacement;
  }

  /**
   * Create mirrored-inverted motion data for the new step
   * Combines location mirroring with motion type flipping
   * **IMPORTANT**: Rotation direction stays the SAME (two flips cancel out)
   */
  private _createMirroredInvertedMotion(
    color: HandSide,
    previousStep: StepData,
    previousMatchingStep: StepData
  ): MotionData {
    const previousMotion = previousStep.motions[color];
    const matchingMotion = previousMatchingStep.motions[color];

    if (!previousMotion || !matchingMotion) {
      throw new Error(`Missing motion data for ${color}`);
    }

    // Mirror the end location vertically (MIRRORED effect)
    const mirroredEndLocation = this._getMirroredLocation(
      matchingMotion.endLocation as GridLocation
    );

    // Flip the motion type (INVERTED effect)
    const invertedMotionType = this._getInvertedMotionType(
      matchingMotion.motionType
    );

    // IMPORTANT: Rotation direction stays the SAME (both transformations flip, so they cancel)
    const rotationDirection = matchingMotion.rotationDirection;

    // Create mirrored-inverted motion
    const mirroredInvertedMotion = {
      ...matchingMotion,
      color, // Preserve the color
      motionType: invertedMotionType, // INVERTED: Flip motion type
      startLocation: previousMotion.endLocation,
      endLocation: mirroredEndLocation, // MIRRORED: Flip location
      rotationDirection: rotationDirection, // NO CHANGE: Both flips cancel out
      // Start orientation will be set by OrientationCalculator
      // End orientation will be calculated by OrientationCalculator
    };

    return mirroredInvertedMotion;
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

export const mirroredInvertedLOOPExecutor = new MirroredInvertedLOOPExecutor(
  loopParameterProvider
);
