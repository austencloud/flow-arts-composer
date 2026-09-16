/**
 * Sequence Transforms
 *
 * Pure functions that transform entire SequenceData objects.
 * Composes beat and start placement transforms.
 *
 * Supports targetHand parameter to transform only specific hand(s):
 * - "left": Only transform left motion
 * - "right": Only transform right motion
 * - "both": Transform both motions (default, original behavior)
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  updateSequenceData,
  createSequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { IMotionQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";

import {
  mirrorBeat,
  flipBeat,
  rotateBeat,
  handSwapBeat,
  invertBeat,
  rewindBeat,
} from "$lib/shared/create/services/step-transforms";
import { rewindMotion } from "$lib/shared/create/services/motion-transforms";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import {
  mirrorStartPlacement,
  flipStartPlacement,
  rotateStartPlacement,
  handSwapStartPlacement,
  invertStartPlacement,
} from "$lib/shared/create/services/start-placement-transforms";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";
import { getToggledGridMode } from "$lib/shared/create/services/rotation-helpers";
import type { TargetHand } from "$lib/shared/create/state/panel-coordination-state.svelte";

/**
 * Clear all steps in a sequence (make them blank).
 */
export function clearSequence(sequence: SequenceData): SequenceData {
  const clearedBeats = sequence.steps.map((step) => ({
    ...step,
    isBlank: true,
    pictographData: null,
    leftReversal: false,
    rightReversal: false,
  }));

  return updateSequenceData(sequence, { steps: clearedBeats });
}

/**
 * Duplicate a sequence with new IDs.
 */
export function duplicateSequence(
  sequence: SequenceData,
  newName?: string
): SequenceData {
  return createSequenceData({
    ...sequence,
    id: crypto.randomUUID(),
    name: newName || `${sequence.name} (Copy)`,
    steps: sequence.steps.map((step) => ({
      ...step,
      id: crypto.randomUUID(),
    })),
  });
}

/**
 * Mirror sequence across vertical axis (E ↔ W).
 * For single-hand transforms, derives new placements and looks up new letters.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function mirrorSequence(
  sequence: SequenceData,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<SequenceData> {
  const gridMode = sequence.gridMode ?? GridMode.DIAMOND;

  const mirroredBeats = await Promise.all(
    sequence.steps.map((step) =>
      mirrorBeat(step, gridMode, motionQueryHandler, targetHand)
    )
  );

  // Transform start placements (always StartPlacementData, never StepData)
  const mirroredStartPlacement = sequence.startPlacement
    ? mirrorStartPlacement(sequence.startPlacement, targetHand)
    : undefined;

  const mirroredStartingPlacementStep = sequence.startingPlacement
    ? mirrorStartPlacement(sequence.startingPlacement, targetHand)
    : undefined;

  return updateSequenceData(sequence, {
    steps: mirroredBeats,
    ...(mirroredStartPlacement && { startPlacement: mirroredStartPlacement }),
    ...(mirroredStartingPlacementStep && {
      startingPlacement: mirroredStartingPlacementStep,
    }),
  });
}

/**
 * Flip sequence across horizontal axis (N ↔ S).
 * For single-hand transforms, derives new placements and looks up new letters.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function flipSequence(
  sequence: SequenceData,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<SequenceData> {
  const gridMode = sequence.gridMode ?? GridMode.DIAMOND;

  const flippedBeats = await Promise.all(
    sequence.steps.map((step) =>
      flipBeat(step, gridMode, motionQueryHandler, targetHand)
    )
  );

  // Transform start placements (always StartPlacementData, never StepData)
  const flippedStartPlacement = sequence.startPlacement
    ? flipStartPlacement(sequence.startPlacement, targetHand)
    : undefined;

  const flippedStartingPlacementStep = sequence.startingPlacement
    ? flipStartPlacement(sequence.startingPlacement, targetHand)
    : undefined;

  return updateSequenceData(sequence, {
    steps: flippedBeats,
    ...(flippedStartPlacement && { startPlacement: flippedStartPlacement }),
    ...(flippedStartingPlacementStep && {
      startingPlacement: flippedStartingPlacementStep,
    }),
  });
}

/**
 * Rotate sequence by 45° steps.
 * For single-hand transforms, also looks up new letters.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function rotateSequence(
  sequence: SequenceData,
  rotationAmount: number,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<SequenceData> {
  const gridMode = sequence.gridMode ?? GridMode.DIAMOND;

  const rotatedBeats = await Promise.all(
    sequence.steps.map((step) =>
      rotateBeat(step, rotationAmount, gridMode, motionQueryHandler, targetHand)
    )
  );

  // Transform start placements (always StartPlacementData, never StepData)
  const rotatedStartPlacement = sequence.startPlacement
    ? rotateStartPlacement(sequence.startPlacement, rotationAmount, targetHand)
    : undefined;

  const rotatedStartingPlacementStep = sequence.startingPlacement
    ? rotateStartPlacement(sequence.startingPlacement, rotationAmount, targetHand)
    : undefined;

  // Only toggle grid mode when both hands are rotated
  const newGridMode =
    targetHand === "both"
      ? getToggledGridMode(gridMode, rotationAmount)
      : gridMode;

  return updateSequenceData(sequence, {
    steps: rotatedBeats,
    ...(rotatedStartPlacement && { startPlacement: rotatedStartPlacement }),
    ...(rotatedStartingPlacementStep && {
      startingPlacement: rotatedStartingPlacementStep,
    }),
    gridMode: newGridMode,
  });
}

/**
 * Swap performer-hand assignments in the sequence (left ↔ right).
 */
export function handSwapSequence(sequence: SequenceData): SequenceData {
  const swappedBeats = sequence.steps.map(handSwapBeat);

  // Transform start placements (always StartPlacementData, never StepData)
  const swappedStartPlacement = sequence.startPlacement
    ? handSwapStartPlacement(sequence.startPlacement)
    : undefined;

  const swappedStartingPlacementStep = sequence.startingPlacement
    ? handSwapStartPlacement(sequence.startingPlacement)
    : undefined;

  return updateSequenceData(sequence, {
    steps: swappedBeats,
    ...(swappedStartPlacement && { startPlacement: swappedStartPlacement }),
    ...(swappedStartingPlacementStep && {
      startingPlacement: swappedStartingPlacementStep,
    }),
  });
}

/**
 * Invert sequence motion types (PRO ↔ ANTI) and rotation directions (CW ↔ CCW).
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function invertSequence(
  sequence: SequenceData,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<SequenceData> {
  if (sequence.steps.length === 0) return sequence;

  const gridMode = sequence.gridMode ?? GridMode.DIAMOND;
  const invertedBeats: StepData[] = [];

  for (const step of sequence.steps) {
    const invertedBeat = await invertBeat(
      step,
      gridMode,
      motionQueryHandler,
      targetHand
    );
    invertedBeats.push(invertedBeat);
  }

  // Transform start placements (always StartPlacementData, never StepData)
  const invertedStartPlacement = sequence.startPlacement
    ? invertStartPlacement(sequence.startPlacement, targetHand)
    : undefined;

  const invertedStartingPlacementStep = sequence.startingPlacement
    ? invertStartPlacement(sequence.startingPlacement, targetHand)
    : undefined;

  const invertedSequence = updateSequenceData(sequence, {
    steps: invertedBeats,
    ...(invertedStartPlacement && { startPlacement: invertedStartPlacement }),
    ...(invertedStartingPlacementStep && {
      startingPlacement: invertedStartingPlacementStep,
    }),
  });

  return recalculateAllOrientations(invertedSequence);
}

/**
 * Rewind sequence (play backwards).
 *
 * "both": the whole sequence plays in reverse — reverse beat ORDER and rewind
 * each beat (both hands), with the new start placement taken from the old final
 * end.
 *
 * "left"/"right": rewind ONE hand's path while the other hand plays forward. This
 * is an independent, valid operation — the target hand retraces its own path and
 * the other hand is untouched, so both hands stay continuous. The result is a
 * legitimate sequence with new letters and a different feel. See
 * {@link rewindSingleHand}.
 *
 * @param targetHand - Which hand(s) to rewind. Defaults to "both".
 */
export async function rewindSequence(
  sequence: SequenceData,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<SequenceData> {
  if (sequence.steps.length === 0) return sequence;

  const gridMode = sequence.gridMode ?? GridMode.DIAMOND;

  if (targetHand !== "both") {
    return rewindSingleHand(sequence, targetHand, gridMode, motionQueryHandler);
  }

  // Both hands: reverse beat order, rewind each beat, derive the new start
  // placement from the old final beat's end state.
  const finalStep = sequence.steps[sequence.steps.length - 1]!;
  const newStartPlacement = createStartPlacementFromStepEnd(finalStep);

  const beatsToProcess = [...sequence.steps].reverse();
  const rewindBeats: StepData[] = [];
  for (let index = 0; index < beatsToProcess.length; index++) {
    const beat = beatsToProcess[index]!;
    const rewoundBeat = await rewindBeat(
      beat,
      index + 1,
      gridMode,
      motionQueryHandler,
      "both"
    );
    rewindBeats.push(rewoundBeat);
  }

  return updateSequenceData(sequence, {
    steps: rewindBeats,
    startPlacement: newStartPlacement,
    startingPlacement: newStartPlacement,
    name: `${sequence.name} (Rewound)`,
  });
}

/**
 * Rewind a single hand's path while the other hand plays forward.
 *
 * The correctness point: reverse the target hand's BEAT ORDER, do not flip each
 * beat in place. New beat i pairs the rewound (N-1-i)th target motion with the
 * i-th forward other-hand motion. Because the target retraces its own contiguous
 * path and the other hand keeps its own, both hands chain (each beat's start ==
 * previous beat's end). Placements and letters are re-derived from the new
 * hand-location pairs (they are genuinely new — neither the original start nor
 * end labels apply). The new start placement is just beat 1's start state: the
 * target hand at its path end, the other hand at its original start.
 */
async function rewindSingleHand(
  sequence: SequenceData,
  targetHand: Exclude<TargetHand, "both">,
  gridMode: GridMode,
  motionQueryHandler: IMotionQueryHandler
): Promise<SequenceData> {
  const steps = sequence.steps;
  const n = steps.length;
  const targetSide = targetHand === "left" ? HandSide.LEFT : HandSide.RIGHT;

  const newSteps: StepData[] = [];
  for (let i = 0; i < n; i++) {
    const forwardStep = steps[i]!; // supplies the non-target hand (forward)
    const targetSource = steps[n - 1 - i]!; // supplies the rewound target hand

    const newMotions = { ...forwardStep.motions };
    const targetSrcMotion = targetSource.motions[targetSide];
    if (targetSrcMotion) {
      newMotions[targetSide] = rewindMotion(targetSrcMotion);
    }

    const leftM = newMotions[HandSide.LEFT];
    const rightM = newMotions[HandSide.RIGHT];

    let startPlacement: GridPlacement | null = forwardStep.startPlacement ?? null;
    let endPlacement: GridPlacement | null = forwardStep.endPlacement ?? null;
    if (leftM && rightM) {
      try {
        startPlacement = getGridPlacementFromLocations(
          leftM.startLocation,
          rightM.startLocation
        );
        endPlacement = getGridPlacementFromLocations(
          leftM.endLocation,
          rightM.endLocation
        );
      } catch (error) {
        console.warn(
          "Failed to derive placements for single-hand rewind beat:",
          error
        );
      }
    }

    let letter: Letter | null = forwardStep.letter ?? null;
    if (leftM && rightM) {
      try {
        const found = await motionQueryHandler.findLetterByMotionConfiguration(
          leftM,
          rightM,
          gridMode
        );
        if (found) letter = found as Letter;
      } catch (error) {
        console.error("Error looking up letter for single-hand rewind:", error);
      }
    }

    newSteps.push(
      createStepData({
        ...forwardStep,
        stepNumber: i + 1,
        motions: newMotions,
        startPlacement,
        endPlacement,
        letter,
        // Reversal flags must be recalculated for the new ordering.
        leftReversal: false,
        rightReversal: false,
      })
    );
  }

  const newStartPlacement = newSteps[0]
    ? createStartPlacementFromBeatStart(newSteps[0])
    : sequence.startPlacement;

  return updateSequenceData(sequence, {
    steps: newSteps,
    ...(newStartPlacement
      ? { startPlacement: newStartPlacement, startingPlacement: newStartPlacement }
      : {}),
    name: `${sequence.name} (Rewound)`,
  });
}

/**
 * Shift the start placement of a sequence.
 * For circular: rotates steps so target beat's end becomes new start.
 * For non-circular: truncates steps before target.
 */
export function shiftStartPlacement(
  sequence: SequenceData,
  targetStepNumber: number
): SequenceData {
  if (targetStepNumber < 1 || targetStepNumber > sequence.steps.length) {
    return sequence;
  }

  // No-op if targeting beat 1
  if (targetStepNumber === 1) {
    return sequence;
  }

  if (sequence.isCircular) {
    return shiftCircularSequence(sequence, targetStepNumber);
  } else {
    return truncateToNewStart(sequence, targetStepNumber);
  }
}

/**
 * Shift a circular sequence by rotating steps.
 * Target beat becomes the new beat 1.
 * The beat BEFORE target's end placement becomes the new start.
 */
function shiftCircularSequence(
  sequence: SequenceData,
  targetStepNumber: number
): SequenceData {
  // New start placement is the beat BEFORE target's end placement
  // (which is the same as target beat's start placement)
  const beatBeforeTarget = sequence.steps[targetStepNumber - 2];
  const newStartPlacement = beatBeforeTarget
    ? createStartPlacementFromStepEnd(beatBeforeTarget)
    : sequence.startPlacement || sequence.startingPlacement;

  // Rotate steps: target and after come first, then everything before target
  const fromTarget = sequence.steps.slice(targetStepNumber - 1);
  const beforeTarget = sequence.steps.slice(0, targetStepNumber - 1);
  const rotatedBeats = [...fromTarget, ...beforeTarget];

  // Renumber steps
  const renumberedSteps = rotatedBeats.map((step, index) =>
    createStepData({ ...step, stepNumber: index + 1 })
  );

  return updateSequenceData(sequence, {
    steps: renumberedSteps,
    startPlacement: newStartPlacement,
    startingPlacement: newStartPlacement,
  });
}

/**
 * Truncate a non-circular sequence to a new start point.
 * Removes steps before the target beat.
 */
function truncateToNewStart(
  sequence: SequenceData,
  targetStepNumber: number
): SequenceData {
  // New start placement from beat BEFORE target
  const beatBeforeTarget = sequence.steps[targetStepNumber - 2]!;
  const newStartPlacement = createStartPlacementFromStepEnd(beatBeforeTarget);

  // Keep only steps from target onwards
  const keptBeats = sequence.steps.slice(targetStepNumber - 1);

  // Renumber
  const renumberedSteps = keptBeats.map((step, index) =>
    createStepData({ ...step, stepNumber: index + 1 })
  );

  return updateSequenceData(sequence, {
    steps: renumberedSteps,
    startPlacement: newStartPlacement,
    startingPlacement: newStartPlacement,
    isCircular: false, // No longer circular after truncation
  });
}

/**
 * Derive the static letter (α, β, γ) from a grid placement.
 * Alpha placements → Letter.ALPHA (α)
 * Beta placements → Letter.BETA (β)
 * Gamma placements → Letter.GAMMA (γ)
 */
function getStaticLetterFromGridPlacement(
  placement: GridPlacement | null | undefined
): Letter {
  if (!placement) return Letter.ALPHA; // Fallback for null/undefined

  const placementStr = placement.toString().toLowerCase();
  if (placementStr.startsWith("beta")) return Letter.BETA;
  if (placementStr.startsWith("gamma")) return Letter.GAMMA;
  return Letter.ALPHA; // Default for alpha placements
}

/**
 * Derive correct letters for all steps in a sequence.
 * Used as Phase 2 after synchronous transforms to update letters asynchronously.
 * This allows smooth CSS animations while still getting correct letter values.
 */
export async function deriveSequenceLetters(
  sequence: SequenceData,
  motionQueryHandler: IMotionQueryHandler
): Promise<SequenceData> {
  // Derive letters for all steps in parallel
  const stepsWithLetters = await Promise.all(
    sequence.steps.map(async (step) => {
      if (step.isBlank) return step;

      const leftMotion = step.motions[HandSide.LEFT];
      const rightMotion = step.motions[HandSide.RIGHT];

      // Invisible placeholder = hand not really there (both-required Step
      // shape): keep the existing letter, exactly like the old absent-hand skip
      // (a dataframe lookup against a placeholder would rewrite the word).
      if (!isVisibleMotion(leftMotion) || !isVisibleMotion(rightMotion))
        return step;

      // Derive gridMode per-step from the motions — never trust the stale
      // sequence-level value (a box step inside a diamond-labelled sequence
      // would otherwise be looked up under the wrong grid mode).
      const gridMode = deriveGridMode(leftMotion, rightMotion);

      try {
        const foundLetter =
          await motionQueryHandler.findLetterByMotionConfiguration(
            leftMotion,
            rightMotion,
            gridMode
          );
        if (foundLetter) {
          return createStepData({
            ...step,
            letter: foundLetter as Letter,
          });
        }
      } catch (error) {
        console.warn(
          `Failed to derive letter for step ${step.stepNumber}:`,
          error
        );
      }
      return step;
    })
  );

  return updateSequenceData(sequence, {
    steps: stepsWithLetters,
  });
}

/**
 * Create a start placement from a beat's end state.
 * Returns StartPlacementData (not StepData) - start placements are semantically distinct from steps.
 */
export function createStartPlacementFromStepEnd(
  step: StepData
): StartPlacementData {
  const leftMotion = step.motions[HandSide.LEFT];
  const rightMotion = step.motions[HandSide.RIGHT];

  // Derive the correct letter from the end placement (alpha, beta, or gamma)
  const letter = getStaticLetterFromGridPlacement(step.endPlacement);

  return createStartPlacementData({
    id: `start-${Date.now()}`,
    letter: letter,
    startPlacement: step.endPlacement ?? null,
    endPlacement: step.endPlacement ?? null,
    gridPlacement: step.endPlacement ?? null,
    motions: {
      [HandSide.LEFT]: leftMotion
        ? {
            ...leftMotion,
            motionType: MotionType.STATIC,
            rotationDirection: RotationDirection.NO_ROTATION,
            startLocation: leftMotion.endLocation,
            endLocation: leftMotion.endLocation,
            arrowLocation: leftMotion.endLocation,
            startOrientation: leftMotion.endOrientation,
            endOrientation: leftMotion.endOrientation,
            turns: 0,
          }
        : undefined,
      [HandSide.RIGHT]: rightMotion
        ? {
            ...rightMotion,
            motionType: MotionType.STATIC,
            rotationDirection: RotationDirection.NO_ROTATION,
            startLocation: rightMotion.endLocation,
            endLocation: rightMotion.endLocation,
            arrowLocation: rightMotion.endLocation,
            startOrientation: rightMotion.endOrientation,
            endOrientation: rightMotion.endOrientation,
            turns: 0,
          }
        : undefined,
    },
  });
}

/**
 * Create a start placement from a beat's START state.
 * Used when a sequence doesn't have an explicit startPlacement but we need to derive one
 * from beat 1's starting configuration.
 * Returns StartPlacementData (not StepData) - start placements are semantically distinct from steps.
 */
export function createStartPlacementFromBeatStart(
  step: StepData
): StartPlacementData {
  const leftMotion = step.motions[HandSide.LEFT];
  const rightMotion = step.motions[HandSide.RIGHT];

  // Derive the correct letter from the start placement (alpha, beta, or gamma)
  const letter = getStaticLetterFromGridPlacement(step.startPlacement);

  return createStartPlacementData({
    id: `start-derived-${Date.now()}`,
    letter: letter,
    startPlacement: step.startPlacement ?? null,
    endPlacement: step.startPlacement ?? null,
    gridPlacement: step.startPlacement ?? null,
    motions: {
      [HandSide.LEFT]: leftMotion
        ? {
            ...leftMotion,
            motionType: MotionType.STATIC,
            rotationDirection: RotationDirection.NO_ROTATION,
            startLocation: leftMotion.startLocation,
            endLocation: leftMotion.startLocation,
            arrowLocation: leftMotion.startLocation,
            startOrientation: leftMotion.startOrientation,
            endOrientation: leftMotion.startOrientation,
            turns: 0,
          }
        : undefined,
      [HandSide.RIGHT]: rightMotion
        ? {
            ...rightMotion,
            motionType: MotionType.STATIC,
            rotationDirection: RotationDirection.NO_ROTATION,
            startLocation: rightMotion.startLocation,
            endLocation: rightMotion.startLocation,
            arrowLocation: rightMotion.startLocation,
            startOrientation: rightMotion.startOrientation,
            endOrientation: rightMotion.startOrientation,
            turns: 0,
          }
        : undefined,
    },
  });
}
