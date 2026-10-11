/**
 * Turn Pattern Apply (firebase-free)
 *
 * The pure transform half of the turn-pattern service: extract a pattern from a
 * sequence, validate it, and apply it (turn application + forward orientation
 * propagation). Split out of `turn-pattern-manager.ts` so consumers that only
 * transform sequences — the deck variation engine and the firebase-free landing
 * hero pool — can import these without dragging the Firestore CRUD half (and its
 * `#lib/shared/auth/firebase.js` side effects) into their bundle.
 *
 * `turn-pattern-manager.ts` re-exports everything here for backward compatibility.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type {
  TurnPattern,
  TurnPatternCreateData,
  TurnPatternEntry,
} from "#lib/shared/create/domain/turn-pattern-data.js";
import {
  createMotionData,
  isVisibleMotion,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  type Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { calculateEndOrientation } from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import { applyTurnToMotion } from "./apply-turns-to-motion";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const logger = createComponentLogger("TurnPatternApply");

/**
 * Specifies which hand(s) to apply pattern changes to
 */
export type TargetHand = "left" | "right" | "both";

/**
 * Result of applying a turn pattern to a sequence
 */
export interface TurnPatternApplyResult {
  /** Whether the application was successful */
  readonly success: boolean;
  /** The modified sequence (if successful) */
  readonly sequence?: SequenceData;
  /** Error message if not successful */
  readonly error?: string;
  /** Number of steps that were modified */
  readonly modifiedSteps?: number;
  /** Warnings about edge cases encountered */
  readonly warnings?: readonly string[];
}

/**
 * Extract a turn pattern from a sequence
 */
export function extractPattern(sequence: SequenceData, name: string): TurnPatternCreateData {
  const entries: TurnPatternEntry[] = [];

  for (let i = 0; i < sequence.steps.length; i++) {
    const beat = sequence.steps[i];
    if (!beat) continue;

    // Invisible placeholder = hand not really there (both-required Step
    // shape): extract null (the "skip this hand" signal), never placeholder turns.
    const leftMotion = isVisibleMotion(beat.motions?.left) ? beat.motions.left : undefined;
    const rightMotion = isVisibleMotion(beat.motions?.right) ? beat.motions.right : undefined;

    entries.push({
      stepIndex: i,
      left: leftMotion?.turns ?? null,
      right: rightMotion?.turns ?? null,
    });
  }

  return {
    name,
    userId: "", // Will be set when saving
    stepCount: sequence.steps.length,
    entries,
  };
}

/**
 * Apply a turn pattern to a sequence
 */
export function applyPattern(
  pattern: TurnPattern,
  sequence: SequenceData,
  targetHand: TargetHand = "both"
): TurnPatternApplyResult {
  // Validate beat count match
  const validation = validateForSequence(pattern, sequence);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const warnings: string[] = [];
  let modifiedSteps = 0;

  // Step 1: Apply all turn changes
  const updatedSteps: StepData[] = sequence.steps.map((step, stepIndex) => {
    const entry = pattern.entries.find((e) => e.stepIndex === stepIndex);
    if (!entry) return step;

    let stepModified = false;
    const updatedMotions = { ...step.motions };

    // Apply left-hand turns (if targeting left or both)
    if (
      (targetHand === "both" || targetHand === "left") &&
      entry.left !== null &&
      isVisibleMotion(step.motions?.left)
    ) {
      const result = applyTurnToMotion(
        entry.left,
        step.motions.left,
        HandSide.LEFT,
        sequence.steps,
        stepIndex
      );
      if (result.motion) {
        updatedMotions.left = result.motion;
        stepModified = true;
      }
      if (result.warning) {
        warnings.push(`Beat ${stepIndex + 1} left: ${result.warning}`);
      }
    }

    // Apply right-hand turns (if targeting right or both)
    if (
      (targetHand === "both" || targetHand === "right") &&
      entry.right !== null &&
      isVisibleMotion(step.motions?.right)
    ) {
      const result = applyTurnToMotion(
        entry.right,
        step.motions.right,
        HandSide.RIGHT,
        sequence.steps,
        stepIndex
      );
      if (result.motion) {
        updatedMotions.right = result.motion;
        stepModified = true;
      }
      if (result.warning) {
        warnings.push(`Beat ${stepIndex + 1} right: ${result.warning}`);
      }
    }

    if (stepModified) {
      modifiedSteps++;
      return { ...step, motions: updatedMotions };
    }
    return step;
  });

  // Step 2: Propagate orientations forward through the sequence
  // This ensures each beat's startOrientation matches the previous beat's endOrientation
  for (let i = 0; i < updatedSteps.length - 1; i++) {
    const currentStep = updatedSteps[i];
    const nextStep = updatedSteps[i + 1];
    if (!currentStep || !nextStep) continue;

    // Propagate blue motion orientation (skip invisible placeholders — the
    // hand isn't really there on that beat)
    if (isVisibleMotion(currentStep.motions?.left) && isVisibleMotion(nextStep.motions?.left)) {
      const currentEndOrientation = currentStep.motions.left.endOrientation;
      const nextStartOrientation = nextStep.motions.left.startOrientation;

      if (currentEndOrientation !== nextStartOrientation) {
        const updatedNextMotion = updateMotionStartOrientation(
          nextStep.motions.left,
          currentEndOrientation,
          HandSide.LEFT
        );

        updatedSteps[i + 1] = {
          ...nextStep,
          motions: {
            ...nextStep.motions,
            left: updatedNextMotion,
          },
        };
      }
    }

    // Propagate red motion orientation
    if (isVisibleMotion(currentStep.motions?.right) && isVisibleMotion(nextStep.motions?.right)) {
      const currentEndOrientation = currentStep.motions.right.endOrientation;
      const nextStartOrientation = nextStep.motions.right.startOrientation;

      if (currentEndOrientation !== nextStartOrientation) {
        const updatedNextMotion = updateMotionStartOrientation(
          nextStep.motions.right,
          currentEndOrientation,
          HandSide.RIGHT
        );

        // Get latest step data (might have been updated for blue already)
        const latestNextStep = updatedSteps[i + 1];
        if (!latestNextStep) continue;
        updatedSteps[i + 1] = {
          ...latestNextStep,
          motions: {
            ...latestNextStep.motions,
            right: updatedNextMotion,
          },
        };
      }
    }
  }

  // Create updated sequence
  const updatedSequence: SequenceData = {
    ...sequence,
    steps: updatedSteps,
  };

  logger.log(
    `Applied pattern "${pattern.name}" - modified ${modifiedSteps} steps with propagation`
  );

  return {
    success: true,
    sequence: updatedSequence,
    modifiedSteps,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate that a pattern can be applied to a sequence
 */
export function validateForSequence(
  pattern: TurnPattern,
  sequence: SequenceData
): { valid: boolean; error?: string } {
  if (pattern.stepCount !== sequence.steps.length) {
    return {
      valid: false,
      error: `Pattern has ${pattern.stepCount} steps but sequence has ${sequence.steps.length} steps`,
    };
  }
  return { valid: true };
}

/**
 * Update a motion's start orientation and recalculate end orientation
 */
function updateMotionStartOrientation(
  motion: MotionData,
  newStartOrientation: Orientation,
  color: HandSide
): MotionData {
  const tempMotion = createMotionData({
    ...motion,
    startOrientation: newStartOrientation,
  });

  const newEndOrientation = calculateEndOrientation(
    tempMotion,
    color
  );

  return createMotionData({
    ...motion,
    startOrientation: newStartOrientation,
    endOrientation: newEndOrientation,
  });
}
