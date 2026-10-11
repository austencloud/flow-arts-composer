/**
 * Which movement the body is in the middle of, and how far through it is.
 *
 * The step map marks arrivals - the instants a shape lands. That is the right
 * thing for a viewer, which wants to light up the shape currently being held.
 * It is the wrong thing here, because the anatomy worth describing happens
 * during the travel, not at the endpoint: an arm reaches behind the head
 * somewhere in the middle of a movement and is back in front by the time it
 * lands.
 *
 * So this reads the same marks the other way round. Between the arrival of move
 * k and the arrival of move k+1, the body is performing move k+1, and where the
 * playhead sits between those two marks is how far through that move it is. A
 * phase of 0 is the launch, 1 is the arrival.
 *
 * Phase 1 of one move and phase 0 of the next name the same instant, which is
 * true of the performance as well - a move's arrival is the next move's launch.
 * The phase anchors keep them distinguishable when an observation is filed.
 */

import type { StepMap } from "#lib/shared/video-collaboration/domain/collaborative-video.js";
import { arrivalTimestamps } from "#lib/shared/video-collaboration/utils/step-map-utils.js";

export interface StepPhasePosition {
  /** 0-based index into the sequence of the move being performed. */
  readonly stepIndex: number;
  /** 0 at the move's launch, 1 at its arrival. */
  readonly phase: number;
  /** Which time through the sequence this is, 1-based. */
  readonly pass: number;
  /** The move's launch and arrival times, for frame stepping within it. */
  readonly startTime: number;
  readonly endTime: number;
}

type ReadableStepMap = Pick<
  StepMap,
  "beatTimestamps" | "stepCount" | "endTimestamp"
>;

/**
 * Null before the first mark, or once the last arrival has passed - at both
 * ends there is no move in progress to describe.
 */
export function stepPhaseAt(
  currentTime: number,
  stepMap: ReadableStepMap
): StepPhasePosition | null {
  const arrivals = arrivalTimestamps(stepMap);
  if (arrivals.length < 2) return null;

  const first = arrivals[0]!;
  if (currentTime < first) return null;

  let mark = -1;
  for (let i = arrivals.length - 1; i >= 0; i--) {
    if (currentTime >= arrivals[i]!) {
      mark = i;
      break;
    }
  }
  if (mark < 0) return null;

  // Past the final arrival the run is over; there is nothing being travelled to.
  if (mark >= arrivals.length - 1) return null;

  const startTime = arrivals[mark]!;
  const endTime = arrivals[mark + 1]!;
  const span = endTime - startTime;
  const phase = span > 0 ? (currentTime - startTime) / span : 0;

  const stepCount = stepMap.stepCount > 0 ? stepMap.stepCount : arrivals.length - 1;

  return {
    stepIndex: mark % stepCount,
    phase: Math.min(1, Math.max(0, phase)),
    pass: Math.floor(mark / stepCount) + 1,
    startTime,
    endTime,
  };
}

/**
 * The video time for a given phase of the move in progress. Used by the phase
 * anchor buttons, so jumping to "mid" lands on the real midpoint of this move
 * rather than a fixed offset.
 *
 * `margin` keeps the result strictly inside the move. A move's launch is the
 * previous move's arrival down to the same instant, and video seeking snaps to
 * whole frames - so asking for phase 0 exactly could land one frame early and
 * file the observation against the previous move at phase 1. Passing half a
 * frame here makes the landing unambiguous. Observed as three recordings at
 * launch, mid and arrival collapsing into two rows, because the launch and the
 * arrival resolved to the same instant.
 */
export function timeForPhase(
  position: StepPhasePosition,
  phase: number,
  margin = 0
): number {
  const clamped = Math.min(1, Math.max(0, phase));
  const raw =
    position.startTime + (position.endTime - position.startTime) * clamped;

  const span = position.endTime - position.startTime;
  // A margin wider than the move itself would invert the bounds; on a very
  // short move, land in the middle instead.
  if (margin <= 0 || span <= margin * 2) return raw;

  return Math.min(
    Math.max(raw, position.startTime + margin),
    position.endTime - margin
  );
}
