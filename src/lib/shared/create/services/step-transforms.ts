/**
 * Beat Transforms
 *
 * Pure functions that transform StepData objects.
 * Composes motion transforms with placement updates.
 *
 * Supports targetHand parameter to transform only specific hand(s):
 * - "left": Only transform left-hand motion
 * - "right": Only transform right-hand motion
 * - "both": Transform both motions (default, original behavior)
 *
 * For single-hand transforms, placements are recomputed from both hands via
 * reconcileStepDerived (a placement is a function of BOTH locations). Letters are
 * reconciled asynchronously by the calling sequence-transform operation.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { IMotionQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { reconcileStepDerived } from "$lib/shared/create/services/sequence-derived-fields";
import {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  SWAPPED_PLACEMENT_MAP,
} from "$lib/shared/create/domain/strict-loop-placement-maps";
import {
  mirrorMotion,
  flipMotion,
  rotateMotion,
  reassignMotionHand,
  invertMotion,
  rewindMotion,
} from "$lib/shared/create/services/motion-transforms";
import { getToggledGridMode } from "$lib/shared/create/services/rotation-helpers";
import type { TargetHand } from "$lib/shared/create/state/panel-coordination-state.svelte";

/**
 * Check if a specific hand should be transformed.
 */
function shouldTransformHand(hand: HandSide, targetHand: TargetHand): boolean {
  if (targetHand === "both") return true;
  if (targetHand === "left" && hand === HandSide.LEFT) return true;
  if (targetHand === "right" && hand === HandSide.RIGHT) return true;
  return false;
}

/**
 * Mirror a beat across the vertical axis (E ↔ W).
 * For single-hand transforms, keeps existing placements/letter for smooth animation.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function mirrorBeat(
  step: StepData,
  gridMode: GridMode,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<StepData> {
  if (step.isBlank || !step) return step;

  const mirroredMotions = { ...step.motions };
  const willTransformLeft = shouldTransformHand(HandSide.LEFT, targetHand);
  const willTransformRight = shouldTransformHand(HandSide.RIGHT, targetHand);

  const leftMotion = step.motions[HandSide.LEFT];
  const rightMotion = step.motions[HandSide.RIGHT];

  if (leftMotion && willTransformLeft) {
    mirroredMotions[HandSide.LEFT] = mirrorMotion(leftMotion);
  }
  if (rightMotion && willTransformRight) {
    mirroredMotions[HandSide.RIGHT] = mirrorMotion(rightMotion);
  }

  // For "both" mode, use fast path with placement maps (no lookup needed)
  if (targetHand === "both") {
    return createStepData({
      ...step,
      startPlacement: step.startPlacement
        ? VERTICAL_MIRROR_PLACEMENT_MAP[step.startPlacement]
        : null,
      endPlacement: step.endPlacement
        ? VERTICAL_MIRROR_PLACEMENT_MAP[step.endPlacement]
        : null,
      motions: mirroredMotions,
    });
  }

  // Single-hand: placements depend on BOTH locations, so recompute them from the
  // mutated motions. Letter is reconciled asynchronously by the caller.
  return reconcileStepDerived(
    createStepData({
      ...step,
      motions: mirroredMotions,
    })
  );
}

/**
 * Flip a beat across the horizontal axis (N ↔ S).
 * For single-hand transforms, keeps existing placements/letter for smooth animation.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function flipBeat(
  step: StepData,
  gridMode: GridMode,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<StepData> {
  if (step.isBlank || !step) return step;

  const flippedMotions = { ...step.motions };
  const leftMotion = step.motions[HandSide.LEFT];
  const rightMotion = step.motions[HandSide.RIGHT];
  if (leftMotion && shouldTransformHand(HandSide.LEFT, targetHand)) {
    flippedMotions[HandSide.LEFT] = flipMotion(leftMotion);
  }
  if (rightMotion && shouldTransformHand(HandSide.RIGHT, targetHand)) {
    flippedMotions[HandSide.RIGHT] = flipMotion(rightMotion);
  }

  // For "both" mode, use fast path with placement maps (no lookup needed)
  if (targetHand === "both") {
    return createStepData({
      ...step,
      startPlacement: step.startPlacement
        ? HORIZONTAL_MIRROR_PLACEMENT_MAP[step.startPlacement]
        : null,
      endPlacement: step.endPlacement
        ? HORIZONTAL_MIRROR_PLACEMENT_MAP[step.endPlacement]
        : null,
      motions: flippedMotions,
    });
  }

  // Single-hand: recompute placements from the mutated motions (letter is async).
  return reconcileStepDerived(
    createStepData({
      ...step,
      motions: flippedMotions,
    })
  );
}

/**
 * Rotate a beat by 45° steps.
 * For both-hand transforms, derives new placements from rotated locations.
 * For single-hand transforms, keeps existing placements/letter for smooth animation.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function rotateBeat(
  step: StepData,
  rotationAmount: number,
  gridMode: GridMode,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<StepData> {
  if (step.isBlank || !step) return step;

  const currentGridMode =
    step.motions[HandSide.LEFT]?.gridMode ?? GridMode.DIAMOND;
  // Note: newGridMode is calculated but not used - placements are derived from motion locations
  void getToggledGridMode(currentGridMode, rotationAmount);

  const rotatedMotions = { ...step.motions };
  const stepLeft = step.motions[HandSide.LEFT];
  const stepRight = step.motions[HandSide.RIGHT];
  if (stepLeft && shouldTransformHand(HandSide.LEFT, targetHand)) {
    rotatedMotions[HandSide.LEFT] = rotateMotion(stepLeft, rotationAmount);
  }
  if (stepRight && shouldTransformHand(HandSide.RIGHT, targetHand)) {
    rotatedMotions[HandSide.RIGHT] = rotateMotion(stepRight, rotationAmount);
  }

  const leftMotion = rotatedMotions[HandSide.LEFT];
  const rightMotion = rotatedMotions[HandSide.RIGHT];

  // For "both" mode, derive placements from rotated locations (no letter lookup needed)
  if (targetHand === "both") {
    let rotatedStartPlacement = step.startPlacement ?? null;
    let rotatedEndPlacement = step.endPlacement ?? null;

    // Invisible placeholder = hand not really there (both-required Step
    // shape): keep the stale-placement behavior the old absent-hand path had.
    if (isVisibleMotion(leftMotion) && isVisibleMotion(rightMotion)) {
      rotatedStartPlacement = getGridPlacementFromLocations(
        leftMotion.startLocation,
        rightMotion.startLocation
      );
      rotatedEndPlacement = getGridPlacementFromLocations(
        leftMotion.endLocation,
        rightMotion.endLocation
      );
    }

    return createStepData({
      ...step,
      startPlacement: rotatedStartPlacement,
      endPlacement: rotatedEndPlacement,
      motions: rotatedMotions,
    });
  }

  // Single-hand: recompute placements from the rotated motions (letter is async).
  return reconcileStepDerived(
    createStepData({
      ...step,
      motions: rotatedMotions,
    })
  );
}

/**
 * Swap hand roles in a beat (left ↔ right).
 */
export function handSwapBeat(step: StepData): StepData {
  if (step.isBlank || !step) return step;

  const stepLeft = step.motions[HandSide.LEFT];
  const stepRight = step.motions[HandSide.RIGHT];
  const swappedMotions = {
    [HandSide.LEFT]: stepRight
      ? reassignMotionHand(stepRight, HandSide.LEFT)
      : undefined,
    [HandSide.RIGHT]: stepLeft
      ? reassignMotionHand(stepLeft, HandSide.RIGHT)
      : undefined,
  };

  return createStepData({
    ...step,
    startPlacement: step.startPlacement
      ? SWAPPED_PLACEMENT_MAP[step.startPlacement]
      : null,
    endPlacement: step.endPlacement
      ? SWAPPED_PLACEMENT_MAP[step.endPlacement]
      : null,
    motions: swappedMotions,
    leftReversal: step.rightReversal,
    rightReversal: step.leftReversal,
  });
}

/**
 * Invert a beat's motion types (PRO ↔ ANTI) and rotation directions (CW ↔ CCW).
 * For both-hand transforms, looks up correct letter from dataset.
 * For single-hand transforms, keeps existing letter for smooth animation.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function invertBeat(
  step: StepData,
  gridMode: GridMode,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<StepData> {
  if (step.isBlank || !step) return step;

  const invertedMotions = { ...step.motions };
  const stepLeft = step.motions[HandSide.LEFT];
  const stepRight = step.motions[HandSide.RIGHT];
  if (stepLeft && shouldTransformHand(HandSide.LEFT, targetHand)) {
    invertedMotions[HandSide.LEFT] = invertMotion(stepLeft);
  }
  if (stepRight && shouldTransformHand(HandSide.RIGHT, targetHand)) {
    invertedMotions[HandSide.RIGHT] = invertMotion(stepRight);
  }

  // For single-hand mode, keep existing letter for instant animation
  if (targetHand !== "both") {
    return createStepData({
      ...step,
      motions: invertedMotions,
    });
  }

  // Look up correct letter from dataset (only when both hands transformed)
  let correctLetter: Letter | null = step.letter ?? null;
  const invertedLeft = invertedMotions[HandSide.LEFT];
  const invertedRight = invertedMotions[HandSide.RIGHT];
  if (invertedLeft && invertedRight) {
    try {
      const foundLetter =
        await motionQueryHandler.findLetterByMotionConfiguration(
          invertedLeft,
          invertedRight,
          gridMode
        );
      if (foundLetter) {
        correctLetter = foundLetter as Letter;
      }
    } catch (error) {
      console.warn(
        `Failed to find letter for inverted step ${step.stepNumber}:`,
        error
      );
    }
  }

  return createStepData({
    ...step,
    letter: correctLetter,
    motions: invertedMotions,
  });
}

/**
 * Rewind a beat (swap start/end, flip rotation).
 * For both-hand transforms, swaps placements and looks up correct letter.
 * For single-hand transforms, keeps existing placements/letter for smooth animation.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export async function rewindBeat(
  step: StepData,
  newStepNumber: number,
  gridMode: GridMode,
  motionQueryHandler: IMotionQueryHandler,
  targetHand: TargetHand = "both"
): Promise<StepData> {
  if (step.isBlank || !step) {
    return { ...step, stepNumber: newStepNumber };
  }

  const rewindMotions = { ...step.motions };
  const stepLeft = step.motions[HandSide.LEFT];
  const stepRight = step.motions[HandSide.RIGHT];
  if (stepLeft && shouldTransformHand(HandSide.LEFT, targetHand)) {
    rewindMotions[HandSide.LEFT] = rewindMotion(stepLeft);
  }
  if (stepRight && shouldTransformHand(HandSide.RIGHT, targetHand)) {
    rewindMotions[HandSide.RIGHT] = rewindMotion(stepRight);
  }

  // For single-hand mode, keep existing placements and letter for instant animation
  if (targetHand !== "both") {
    return createStepData({
      ...step,
      stepNumber: newStepNumber,
      motions: rewindMotions,
      // Clear reversal flags - they must be recalculated based on the new sequence order
      leftReversal: false,
      rightReversal: false,
    });
  }

  // Look up correct letter from dataset (only when both hands transformed)
  let correctLetter: Letter | null = step.letter ?? null;
  const rewoundLeft = rewindMotions[HandSide.LEFT];
  const rewoundRight = rewindMotions[HandSide.RIGHT];
  if (rewoundLeft && rewoundRight) {
    try {
      const foundLetter =
        await motionQueryHandler.findLetterByMotionConfiguration(
          rewoundLeft,
          rewoundRight,
          gridMode
        );
      if (foundLetter) {
        correctLetter = foundLetter as Letter;
      }
    } catch (error) {
      console.error(`Error looking up letter for rewound step:`, error);
    }
  }

  return createStepData({
    ...step,
    stepNumber: newStepNumber,
    startPlacement: step.endPlacement ?? null,
    endPlacement: step.startPlacement ?? null,
    motions: rewindMotions,
    letter: correctLetter,
    // Clear reversal flags - they must be recalculated based on the new sequence order
    leftReversal: false,
    rightReversal: false,
  });
}
