/**
 * Mirrored Swapped LOOP Executor
 *
 * Executes the mirrored-swapped LOOP (Linked Orbital Offset Pattern) by combining:
 * 1. SWAPPED: Blue does what Red did, Red does what Blue did
 * 2. MIRRORED: Mirror locations vertically (E↔W), flip prop rotation (CW↔CCW)
 *
 * This creates a sequence where:
 * - Colors are swapped (Blue performs Red's actions and vice versa)
 * - Locations are mirrored vertically across the north-south axis
 * - Prop rotation directions are flipped
 * - Motion types stay the same
 * - Letters stay the same
 *
 * IMPORTANT: Slice size is ALWAYS halved (no quartering)
 * IMPORTANT: End placement must be vertical mirror of start placement
 */

import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  RotationDirection,
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  GridPlacement,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
  SWAPPED_PLACEMENT_MAP,
  MIRRORED_SWAPPED_VALIDATION_SET,
} from "../domain/constants/strict-loop-placement-maps";
import type { Period } from "../domain/models/circular-models";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class MirroredSwappedLOOPExecutor {
  constructor() {}

  /**
   * Execute the mirrored-swapped LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - Ignored (mirrored-swapped LOOP always uses halved)
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
   * Validate that the sequence can perform a mirrored-swapped LOOP
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

    // Check if the (start, end) pair is valid for mirrored-swapped
    const key = `${startPos},${endPos}`;

    if (!MIRRORED_SWAPPED_VALIDATION_SET.has(key)) {
      throw new Error(
        `Invalid placement pair for mirrored-swapped LOOP: ${startPos} → ${endPos}. ` +
          `For a mirrored-swapped LOOP, the end placement must be the vertical mirror of start placement.`
      );
    }
  }

  /**
   * Create a new LOOP entry by transforming a previous step with SWAP + MIRROR
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

    // Get the mirrored AND swapped end placement
    // For mirrored+swapped LOOP, we need to apply both transformations to the grid placement
    const mirroredSwappedEndPlacement =
      this._getMirroredSwappedPlacement(previousMatchingStep);

    // Create the new step with swapped and mirrored attributes
    // KEY: Continuity is NORMAL (same color continues from where it was)
    //      But motion PATTERNS are swapped (blue does red's pattern, red does blue's)
    //      Then patterns are mirrored (cw↔ccw, e↔w)
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: previousMatchingStep.letter ?? null, // Same letter
      startPlacement: previousStep.endPlacement ?? null, // NORMAL continuity (not swapped)
      endPlacement: mirroredSwappedEndPlacement,
      motions: {
        // SWAP: Blue does what Red did, but with mirrored transformation
        [HandSide.LEFT]: this._createMirroredSwappedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep,
          true // isSwapped = true (use opposite color's data)
        ),
        // SWAP: Red does what Blue did, but with mirrored transformation
        [HandSide.RIGHT]: this._createMirroredSwappedMotion(
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
   * Get the mirrored AND swapped placement
   * For mirrored+swapped LOOP, the end placement must reflect both transformations:
   * 1. First mirror the placement (east↔west)
   * 2. Then swap the colors (blue↔red placements)
   */
  private _getMirroredSwappedPlacement(
    previousMatchingStep: StepData
  ): GridPlacement | null {
    const endPos = previousMatchingStep.endPlacement;

    if (!endPos) {
      throw new Error("Previous matching step must have an end placement");
    }

    // First mirror, then swap (same order as LOOPEndPlacementSelector)
    const mirroredPlacement =
      VERTICAL_MIRROR_PLACEMENT_MAP[endPos as GridPlacement];
    const mirroredSwappedPlacement = SWAPPED_PLACEMENT_MAP[mirroredPlacement];

    return mirroredSwappedPlacement;
  }

  /**
   * Create mirrored-swapped motion data for the new step
   * Combines color swapping with location mirroring and rotation flipping
   *
   * KEY INSIGHT:
   * - CONTINUITY is NORMAL: Same color continues from where it ended
   * - PATTERN is SWAPPED: Blue does what Red did, Red does what Blue did
   * - PATTERN is MIRRORED: Locations flip e↔w, rotations flip cw↔ccw
   */
  private _createMirroredSwappedMotion(
    color: HandSide,
    previousStep: StepData,
    previousMatchingStep: StepData,
    _isSwapped: boolean // Kept for interface compatibility, always true for this executor
  ): MotionData {
    // Get the opposite color for pattern swapping
    const oppositeColor =
      color === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;

    // NORMAL CONTINUITY: Same color continues from where it was
    // (Blue continues from Blue's previous end, Red continues from Red's previous end)
    const previousMotion = previousStep.motions[color];

    // SWAPPED PATTERN: Get the pattern from the opposite color's matching step
    // (Blue follows Red's pattern from step 1, Red follows Blue's pattern from step 1)
    const matchingMotion = previousMatchingStep.motions[oppositeColor];

    if (!previousMotion || !matchingMotion) {
      throw new Error(`Missing motion data for ${color}`);
    }

    // Get start location from THIS color's previous end (NORMAL continuity)
    const startLocation = previousMotion.endLocation;

    // For STATIC motions, end = start (no movement)
    // For other motions, mirror the end location vertically
    const endLocation =
      matchingMotion.motionType === MotionType.STATIC
        ? startLocation
        : this._getMirroredLocation(matchingMotion.endLocation as GridLocation);

    // Flip the prop rotation direction (mirroring effect)
    const mirroredPropRotDir = this._getMirroredPropRotDir(
      matchingMotion.rotationDirection
    );

    // Create mirrored-swapped motion
    const mirroredSwappedMotion = {
      ...matchingMotion,
      color, // IMPORTANT: Preserve the color (Blue stays Blue, Red stays Red)
      motionType: matchingMotion.motionType, // Same motion type (no inverted flip)
      startLocation,
      endLocation,
      rotationDirection: mirroredPropRotDir,
      // Start orientation will be set by OrientationCalculator
      // End orientation will be calculated by OrientationCalculator
    };

    return mirroredSwappedMotion;
  }

  /**
   * Mirror a location vertically (flip east/west)
   */
  private _getMirroredLocation(location: GridLocation): GridLocation {
    const mirrored = VERTICAL_MIRROR_LOCATION_MAP[location];

    return mirrored;
  }

  /**
   * Mirror prop rotation direction (flip CLOCKWISE ↔ COUNTER_CLOCKWISE)
   * NO_ROTATION stays NO_ROTATION
   */
  private _getMirroredPropRotDir(
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

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const mirroredSwappedLOOPExecutor = new MirroredSwappedLOOPExecutor();
