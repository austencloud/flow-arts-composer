/**
 * Time in the reference videos, in the lab's terms.
 *
 * The timed video is the clock. Its timing, mapped in Post Studio, says where
 * in the sequence the performer is at each moment; this module turns that
 * into the lab's phase. The other videos follow the timed one, shifted by
 * however much later or earlier each heard the clap.
 */
import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";
import {
  takeSampleAt,
  type ResolvedTakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";

/**
 * How far below the step count a landed last move sits. The lab wraps a
 * phase equal to the step count back to the opening, which is a different
 * pose for a sequence that does not return to its start.
 */
export const LANDED_PHASE_MARGIN = 0.001;

/** The lab phase at a time in the timed video; null when nothing is mapped. */
export function labPhaseAtVideoSeconds(
  resolved: ResolvedTakeTiming,
  moveBeats: readonly number[],
  seconds: number
): number | null {
  const sample = takeSampleAt(resolved, seconds);
  if (!sample) return null;
  const frame = sequenceFrameAt(sample.arrival, moveBeats, {
    endArrival: sample.endArrival,
  });
  if (frame.phase === "opening") return 0;
  return Math.min(frame.passArrival, moveBeats.length - LANDED_PHASE_MARGIN);
}

const SAME_MOMENT_SECONDS = 1 / 240;

/** The landing after (1) or before (-1) a time, across every mapped section. */
export function adjacentLandingSeconds(
  resolved: ResolvedTakeTiming,
  seconds: number,
  direction: 1 | -1
): number | null {
  const times = resolved.sections
    .flatMap((section) => section.landings.map((landing) => landing.seconds))
    .sort((a, b) => a - b);
  if (direction === 1) {
    return times.find((time) => time > seconds + SAME_MOMENT_SECONDS) ?? null;
  }
  for (let index = times.length - 1; index >= 0; index -= 1) {
    if (times[index]! < seconds - SAME_MOMENT_SECONDS) return times[index]!;
  }
  return null;
}

export interface ReferenceSync {
  /** When this video heard the clap; null when none was found. */
  clapSeconds: number | null;
  /** Austen's own nudge on top of the clap, seconds. */
  manualOffsetSeconds: number;
}

/** Where a follower video should be when the timed one is at `masterSeconds`. */
export function followerVideoSeconds(
  masterSeconds: number,
  master: ReferenceSync,
  follower: ReferenceSync
): number {
  const clapShift =
    master.clapSeconds !== null && follower.clapSeconds !== null
      ? follower.clapSeconds - master.clapSeconds
      : 0;
  return masterSeconds + clapShift + follower.manualOffsetSeconds;
}
