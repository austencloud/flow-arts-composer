/**
 * Rotated Swapped Inverted LOOP Executor
 *
 * Executes the rotated-swapped-inverted LOOP (Linked Orbital Offset Pattern) by combining:
 * 1. ROTATED: Rotate locations based on handpath direction (90°, 180°, or 270°)
 * 2. SWAPPED: Blue does what Red did, Red does what Blue did
 * 3. INVERTED: Flip letters (A↔B), flip motion types (PRO↔ANTI), flip prop rotation (CW↔CCW)
 *
 * Rotation-direction composition (matches the sibling combos' documented rules):
 * - ROTATED alone (rotated-swapped-loop-executor.ts): no flip — rotation direction
 *   is carried through unchanged from the matching motion.
 * - SWAPPED alone: no flip — swap only changes which color's pattern is followed.
 * - INVERTED alone (rotated-inverted-loop-executor.ts): flips CW ↔ CCW.
 * Combined, only INVERTED contributes a flip, so the net effect is a SINGLE flip
 * of the prop rotation direction (unlike mirrored-swapped-inverted, where MIRROR
 * itself also flips and the two flips cancel out to "preserved").
 *
 * This creates a sequence where:
 * - Colors are swapped (Blue performs Red's actions and vice versa)
 * - Letters are flipped (A ↔ B)
 * - Motion types are flipped (PRO ↔ ANTI)
 * - Locations are rotated based on the (swapped) handpath direction
 * - Prop rotation direction is flipped once (CW ↔ CCW)
 *
 * IMPORTANT: Slice size is ALWAYS halved (no quartering) — matches the other
 * *_INVERTED three-component combos, since the sequence must return to start.
 * IMPORTANT: End placement must RETURN TO START PLACEMENT (inverted effect;
 * all beta placements are swap fixed points and rotation is inner, so the
 * outer swap+invert composition still resolves to the start placement)
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  MotionType,
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
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
  getHandRotationDirection,
  getLocationMapForHandRotation,
} from "../domain/constants/circular-placement-maps";
import { INVERTED_LOOP_VALIDATION_SET } from "../domain/constants/strict-loop-placement-maps";
import type { Period } from "../domain/models/circular-models";
import type { ILOOPExecutor } from "./ILOOPExecutor";

export class RotatedSwappedInvertedLOOPExecutor implements ILOOPExecutor {
  constructor(private loopParams: LOOPParameterProvider) {}

  /**
   * Execute the rotated-swapped-inverted LOOP
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param _period - Ignored (rotated-swapped-inverted LOOP always uses halved)
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
    let nextStepNumber = lastStep.stepNumber + 1;

    const finalIntendedLength = sequenceLength + entriesToAdd;
    for (let i = 0; i < entriesToAdd; i++) {
      const nextStep = this._createNewLOOPEntry(
        sequence,
        lastStep,
        nextStepNumber,
        finalIntendedLength
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
   * Validate that the sequence can perform a rotated-swapped-inverted LOOP
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

    const key = `${startPos},${endPos}`;

    if (!INVERTED_LOOP_VALIDATION_SET.has(key)) {
      throw new Error(
        `Invalid placement pair for rotated-swapped-inverted LOOP: ${startPos} → ${endPos}. ` +
          `For a rotated-swapped-inverted LOOP, the end placement must return to the start placement (${startPos}).`
      );
    }
  }

  /**
   * Create a new LOOP entry by transforming a previous step with ROTATE + SWAP + INVERTED
   */
  private _createNewLOOPEntry(
    sequence: StepData[],
    previousStep: StepData,
    stepNumber: number,
    finalIntendedLength: number
  ): StepData {
    const previousMatchingStep = this._getPreviousMatchingBeat(
      sequence,
      stepNumber,
      finalIntendedLength
    );

    if (!previousMatchingStep.letter) {
      throw new Error("Previous matching step must have a letter");
    }
    const invertedLetter = this.loopParams.getInvertedLetter(
      previousMatchingStep.letter as string
    ) as Letter;

    const rotatedEndPlacement = this._getRotatedEndPlacement(
      previousStep,
      previousMatchingStep
    );

    // KEY: Blue gets attributes from Red's matching step (SWAP)
    //      Red gets attributes from Blue's matching step (SWAP)
    //      Motion types are flipped (INVERTED)
    //      Letters are flipped (INVERTED)
    //      Locations are rotated based on the swapped handpath (ROTATED)
    const newStep: StepData = {
      ...previousMatchingStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: invertedLetter,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: rotatedEndPlacement,
      motions: {
        [HandSide.LEFT]: this._createRotatedSwappedInvertedMotion(
          HandSide.LEFT,
          previousStep,
          previousMatchingStep
        ),
        [HandSide.RIGHT]: this._createRotatedSwappedInvertedMotion(
          HandSide.RIGHT,
          previousStep,
          previousMatchingStep
        ),
      },
    };

    const stepWithStartOri = updateStartOrientations(newStep, previousStep);
    const finalStep = updateEndOrientations(stepWithStartOri);

    return finalStep;
  }

  /** Get the previous matching step using index mapping (halved pattern) */
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

    const arrayIndex = matchingStepNumber - 1;

    if (arrayIndex < 0 || arrayIndex >= sequence.length) {
      throw new Error(
        `Invalid index mapping: stepNumber ${stepNumber} → matchingStepNumber ${matchingStepNumber} → arrayIndex ${arrayIndex} (sequence length: ${sequence.length})`
      );
    }

    return sequence[arrayIndex]!;
  }

  /** Generate index mapping for retrieving corresponding steps (halved pattern only) */
  private _getIndexMap(length: number): Record<number, number> {
    const map: Record<number, number> = {};
    const halfLength = Math.floor(length / 2);

    for (let i = halfLength + 1; i <= length; i++) {
      map[i] = i - halfLength;
    }

    return map;
  }

  /**
   * Get the rotated end placement by rotating both colors' locations, using
   * the SWAPPED handpath (Blue rotates by Red's handpath and vice versa) —
   * same swap-then-rotate composition as rotated-swapped-loop-executor.
   */
  private _getRotatedEndPlacement(
    previousStep: StepData,
    previousMatchingStep: StepData
  ): GridPlacement | null {
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

    const leftLocationMap = getLocationMapForHandRotation(leftHandRotDir);
    const rightLocationMap = getLocationMapForHandRotation(rightHandRotDir);

    const newLeftEndLoc =
      leftLocationMap[
        previousStep.motions[HandSide.LEFT]!.endLocation as GridLocation
      ];
    const newRightEndLoc =
      rightLocationMap[
        previousStep.motions[HandSide.RIGHT]!.endLocation as GridLocation
      ];

    return getGridPlacementFromLocations(newLeftEndLoc, newRightEndLoc);
  }

  /**
   * Create rotated-swapped-inverted motion data for the new step
   * Combines color swapping, location rotation, inverted motion type, and a
   * single flip of the prop rotation direction (INVERTED is the only
   * flip-contributing transform in this combo — see file header).
   */
  private _createRotatedSwappedInvertedMotion(
    hand: HandSide,
    previousStep: StepData,
    previousMatchingStep: StepData
  ): MotionData {
    const oppositeHand =
      hand === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;

    const previousMotion = previousStep.motions[hand];
    const matchingMotion = previousMatchingStep.motions[oppositeHand];

    if (!previousMotion || !matchingMotion) {
      throw new Error(`Missing motion data for ${hand}`);
    }

    const startLocation = previousMotion.endLocation;

    const invertedMotionType = this._getInvertedMotionType(
      matchingMotion.motionType
    );

    const handRotDir = getHandRotationDirection(
      matchingMotion.startLocation as GridLocation,
      matchingMotion.endLocation as GridLocation
    );
    const locationMap = getLocationMapForHandRotation(handRotDir);

    const endLocation =
      invertedMotionType === MotionType.STATIC
        ? startLocation
        : locationMap[startLocation as GridLocation];

    const invertedPropRotDir = this._getInvertedPropRotDir(
      matchingMotion.rotationDirection
    );

    return {
      ...matchingMotion,
      hand,
      motionType: invertedMotionType,
      startLocation,
      endLocation,
      rotationDirection: invertedPropRotDir,
    };
  }

  /** Get the inverted motion type (flip PRO ↔ ANTI); STATIC and DASH stay the same */
  private _getInvertedMotionType(motionType: MotionType): MotionType {
    if (motionType === MotionType.PRO) return MotionType.ANTI;
    if (motionType === MotionType.ANTI) return MotionType.PRO;
    return motionType;
  }

  /** Get the inverted prop rotation direction (flip CW ↔ CCW); NO_ROTATION stays NO_ROTATION */
  private _getInvertedPropRotDir(
    propRotDir: RotationDirection
  ): RotationDirection {
    if (propRotDir === RotationDirection.CLOCKWISE) {
      return RotationDirection.COUNTER_CLOCKWISE;
    }
    if (propRotDir === RotationDirection.COUNTER_CLOCKWISE) {
      return RotationDirection.CLOCKWISE;
    }
    return propRotDir;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { loopParameterProvider } from "$lib/features/create/generate/shared/services/loop-parameter-provider";

export const rotatedSwappedInvertedLOOPExecutor = new RotatedSwappedInvertedLOOPExecutor(
  loopParameterProvider
);
