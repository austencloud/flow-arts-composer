import type { ClipStep } from "@austencloud/video-editor";
import { POST_TIME_EPSILON } from "@austencloud/video-editor/core";

/**
 * A landing mark on the crop screen's clip timeline. The plugin works the
 * marks out (tka: `tkaCropSteps` in the plugin's ui folder).
 */
export type { ClipStep };

/** The nearest step strictly before or after `seconds`, or null. */
export function adjacentStepSeconds(
  steps: readonly ClipStep[],
  seconds: number,
  direction: "previous" | "next"
): number | null {
  if (direction === "previous") {
    let found: number | null = null;
    for (const step of steps) {
      if (step.seconds < seconds - POST_TIME_EPSILON) found = step.seconds;
      else break;
    }
    return found;
  }
  for (const step of steps) {
    if (step.seconds > seconds + POST_TIME_EPSILON) return step.seconds;
  }
  return null;
}
