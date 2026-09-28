import {
  POST_TIME_EPSILON,
  itemEnd,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import { postSecondsOfKeyframe } from "$lib/shared/media-composition/domain/post-project-keyframes";
import type {
  ResolvedTakeTiming,
  TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { shownLandings } from "../builder/timing-lane-landings";

/**
 * One landing of the sequence inside a clip: the moment a placement is held,
 * from the beats Austen tapped for the take. The crop screen draws these so
 * a keyframe can go where the performer lands, then be nudged to where the
 * body actually got there.
 */
export interface ClipStep {
  /** Post seconds. */
  seconds: number;
  /** Arrival position: 0 is the opening pose, p the landing of move p. */
  position: number;
  /** Index into the sequence's steps; null for the opening pose. */
  stepIndex: number | null;
  /** The count as the Timing tool shows it: "S", then 1 to the moves per pass. */
  label: string;
  /** The first move of a pass through the sequence. */
  passStart: boolean;
}

/**
 * The take's landings that fall inside the clip, in post seconds, earliest
 * first. A take not yet tapped has none.
 */
export function clipSteps(
  item: PostVideoItem,
  timing: TakeTiming | null,
  resolved: ResolvedTakeTiming | null
): ClipStep[] {
  if (!timing || !resolved || resolved.movesPerPass <= 0) return [];
  const moves = resolved.movesPerPass;
  const start = item.start - POST_TIME_EPSILON;
  const end = itemEnd(item) + POST_TIME_EPSILON;
  return shownLandings(timing, resolved)
    .map((landing) => {
      const stepIndex =
        landing.position > 0 ? (landing.position - 1) % moves : null;
      return {
        seconds: postSecondsOfKeyframe(item, landing.seconds),
        position: landing.position,
        stepIndex,
        label: stepIndex === null ? "S" : String(stepIndex + 1),
        passStart: stepIndex === 0,
      };
    })
    .filter((step) => step.seconds >= start && step.seconds <= end)
    .sort((a, b) => a.seconds - b.seconds);
}

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
