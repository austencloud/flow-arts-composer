/**
 * Orientation Continuity Validator
 *
 * Validates beat-to-beat orientation continuity in sequences.
 * Each beat's start orientation must match the previous beat's end orientation.
 */

import type {
  OrientationContinuityError,
  TransitionValidationResult,
} from "./types";

/**
 * Interface describing the shape of the orientation continuity validator module.
 * Consumers that previously held a class instance can use this type.
 */
export interface OrientationContinuityValidator {
  validateSequence: (sequence: SequenceData) => OrientationContinuityError[];
  validateTransition: (
    lastStep: StepData,
    nextPictograph: PictographData,
    orientationCalculator: OrientationCalculatorDep
  ) => TransitionValidationResult;
}
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";

/**
 * Structural type for the orientation calculator dependency.
 * The validateTransition param is accepted for signature compatibility but unused.
 */
type OrientationCalculatorDep = {
  calculateEndOrientation: (...args: never[]) => unknown;
};

export function validateSequence(
  sequence: SequenceData
): OrientationContinuityError[] {
  const errors: OrientationContinuityError[] = [];

  if (sequence.steps.length === 0) {
    return errors;
  }

  // Check each beat against the previous one
  for (let i = 0; i < sequence.steps.length; i++) {
    const currentStep = sequence.steps[i];
    if (!currentStep) continue;

    // Get the previous beat (or start placement for first beat)
    const previousBeat =
      i === 0 ? sequence.startPlacement : sequence.steps[i - 1];

    if (!previousBeat?.motions) continue;

    // Validate left-hand prop orientation continuity
    const leftError = validateHandContinuity(
      currentStep,
      previousBeat,
      HandSide.LEFT,
      i
    );
    if (leftError) {
      errors.push(leftError);
    }

    // Validate right-hand prop orientation continuity
    const rightError = validateHandContinuity(
      currentStep,
      previousBeat,
      HandSide.RIGHT,
      i
    );
    if (rightError) {
      errors.push(rightError);
    }
  }

  return errors;
}

export function validateTransition(
  lastStep: StepData,
  nextPictograph: PictographData,
  _orientationCalculator: OrientationCalculatorDep
): TransitionValidationResult {
  const errors: OrientationContinuityError[] = [];

  // Check left-hand prop orientation
  const leftMotion = nextPictograph.motions[HandSide.LEFT];
  const lastLeftMotion = lastStep.motions[HandSide.LEFT];
  // Invisible placeholder = hand not really there (both-required Step shape):
  // vacuously valid, exactly like the old absent-hand skip.
  if (isVisibleMotion(leftMotion) && isVisibleMotion(lastLeftMotion)) {
    const expectedStartOrientation = lastLeftMotion.endOrientation;
    const actualStartOrientation = leftMotion.startOrientation;

    if (expectedStartOrientation !== actualStartOrientation) {
      errors.push({
        stepIndex: lastStep.stepNumber,
        hand: HandSide.LEFT,
        expectedStartOrientation: expectedStartOrientation || "unknown",
        actualStartOrientation: actualStartOrientation || "unknown",
        message: `Left prop orientation break: expected ${expectedStartOrientation} but got ${actualStartOrientation}`,
      });
    }
  }

  // Check right-hand prop orientation
  const rightMotion = nextPictograph.motions[HandSide.RIGHT];
  const lastRightMotion = lastStep.motions[HandSide.RIGHT];
  if (isVisibleMotion(rightMotion) && isVisibleMotion(lastRightMotion)) {
    const expectedStartOrientation = lastRightMotion.endOrientation;
    const actualStartOrientation = rightMotion.startOrientation;

    if (expectedStartOrientation !== actualStartOrientation) {
      errors.push({
        stepIndex: lastStep.stepNumber,
        hand: HandSide.RIGHT,
        expectedStartOrientation: expectedStartOrientation || "unknown",
        actualStartOrientation: actualStartOrientation || "unknown",
        message: `Right prop orientation break: expected ${expectedStartOrientation} but got ${actualStartOrientation}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Helper: Validate orientation continuity for one hand.
 */
function validateHandContinuity(
  currentStep: StepData | PictographData,
  previousBeat: StepData | PictographData,
  hand: HandSide,
  stepIndex: number
): OrientationContinuityError | null {
  const currentMotion = currentStep.motions[hand];
  const previousMotion = previousBeat.motions[hand];

  if (!isVisibleMotion(currentMotion) || !isVisibleMotion(previousMotion)) {
    return null; // Skip if either beat doesn't really have this hand
  }

  const expectedStartOrientation = previousMotion.endOrientation;
  const actualStartOrientation = currentMotion.startOrientation;

  if (expectedStartOrientation !== actualStartOrientation) {
    return {
      stepIndex,
      hand,
      expectedStartOrientation: expectedStartOrientation || "unknown",
      actualStartOrientation: actualStartOrientation || "unknown",
      message: `${hand === HandSide.LEFT ? "Left" : "Right"} prop orientation break at step ${stepIndex + 1}: expected ${expectedStartOrientation} but got ${actualStartOrientation}`,
    };
  }

  return null;
}
