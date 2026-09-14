import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * choose-start-analyzer.ts
 *
 * Pure logic for the "Choose Start" picker. Every tile in the workspace is a
 * pose: tile 0 is the start tile, and step tile N shows the pose after beat N
 * (props are drawn at their end locations). Tapping a tile makes that pose
 * the sequence start, which means the step AFTER it becomes step 1. This
 * translates the tapped tile into the target step number the existing
 * `shiftStartPosition` transform expects, and decides whether the user needs
 * to confirm first.
 */

export type StartPickAnalysis =
  | { action: "no-op"; reason: string }
  | { action: "immediate"; targetStepNumber: number }
  | {
      action: "confirm-needed";
      targetStepNumber: number;
      stepsToRemove: number;
    };

export interface StartPickResult {
  success: boolean;
  stepsRemoved: number;
  message: string;
}

const ALREADY_START = "That's already the start.";

/**
 * Loop-only translation of a tapped pose into the step that becomes step 1.
 * Returns null when the pose is already the start: the start tile itself, or
 * the last step, whose end pose is the loop's start pose.
 *
 * @param tileIndex 0 for the start tile, 1..n for step tiles.
 */
export function loopStartPickTarget(
  stepCount: number,
  tileIndex: number
): number | null {
  if (tileIndex <= 0 || tileIndex >= stepCount) return null;
  return tileIndex + 1;
}

/**
 * @param tileIndex 0 for the start tile, 1..n for step tiles.
 */
export function analyzeStartPick(
  sequence: SequenceData,
  tileIndex: number
): StartPickAnalysis {
  const stepCount = sequence.steps.length;

  if (tileIndex === 0) {
    return { action: "no-op", reason: ALREADY_START };
  }
  if (tileIndex < 0 || tileIndex > stepCount) {
    return { action: "no-op", reason: "Invalid tile" };
  }

  if (sequence.isCircular) {
    const targetStepNumber = loopStartPickTarget(stepCount, tileIndex);
    return targetStepNumber === null
      ? { action: "no-op", reason: ALREADY_START }
      : { action: "immediate", targetStepNumber };
  }

  if (tileIndex === stepCount) {
    return {
      action: "no-op",
      reason: "Nothing would be left after this step.",
    };
  }

  const targetStepNumber = tileIndex + 1;

  return {
    action: "confirm-needed",
    targetStepNumber,
    stepsToRemove: tileIndex,
  };
}

export function getStartPickMessage(
  sequence: SequenceData,
  targetStepNumber: number
): StartPickResult {
  const stepsRemoved = sequence.isCircular ? 0 : targetStepNumber - 1;

  if (stepsRemoved > 0) {
    return {
      success: true,
      stepsRemoved,
      message: `New start set. Removed ${stepsRemoved} step${stepsRemoved === 1 ? "" : "s"}.`,
    };
  }

  return { success: true, stepsRemoved: 0, message: "New start set." };
}
