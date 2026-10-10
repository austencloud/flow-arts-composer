/**
 * Step Map Utilities
 *
 * Pure functions for working with step-to-timestamp mappings.
 * Used to sync video playback position with sequence notation highlights.
 */

import type { StepMap } from "#lib/shared/video-collaboration/domain/collaborative-video.js";

/** Everything below needs the closing arrival, so accept a whole-ish map. */
type ReadableStepMap = Pick<
  StepMap,
  "beatTimestamps" | "stepCount" | "endTimestamp"
>;

/**
 * Every instant the performer marked, in tap order: the opening pose, then the
 * landing of each move.
 *
 * `beatTimestamps` holds all but the last of them, because a move's arrival is
 * the next move's launch - which is why the same array reads as "when move i+1
 * starts". `endTimestamp` is the closing arrival, and it is optional because
 * maps saved before the editor collected one have no value for it.
 */
export function arrivalTimestamps(stepMap: ReadableStepMap): number[] {
  const { beatTimestamps, endTimestamp } = stepMap;
  const last = beatTimestamps[beatTimestamps.length - 1];
  const closes =
    endTimestamp !== undefined &&
    Number.isFinite(endTimestamp) &&
    (last === undefined || endTimestamp > last);
  return closes ? [...beatTimestamps, endTimestamp!] : [...beatTimestamps];
}

/**
 * Given a video's current playback time and a step map,
 * returns the 0-based index of the MARK that is current.
 * Returns -1 if before the first mark.
 *
 * On a clip that runs the sequence more than once this counts past the end of
 * the sequence - mark 20 of a 16-step run is the fourth move of pass two. Use
 * `getStepIndexFromVideo` to get a step to render; this one is for surfaces
 * that address the marks themselves, like the timeline.
 */
export function getHighlightedBeatFromVideo(
  currentTime: number,
  beatTimestamps: number[]
): number {
  // Walk backwards from the last step to find the most recent one
  // that has already started at the current playback time
  for (let i = beatTimestamps.length - 1; i >= 0; i--) {
    if (currentTime >= beatTimestamps[i]!) return i;
  }
  return -1;
}

/**
 * The step the video is showing right now, as an index into the sequence.
 * -1 while the opening pose is what is on screen.
 *
 * A mark is an ARRIVAL: the performer taps at the instant the shape lands, so
 * the shape held from mark k until mark k+1 is move k, and mark 0 is the
 * opening pose with no move before it. Lighting move k+1 there instead would
 * run the notation one shape ahead of the footage and leave the start position
 * dark for the whole take.
 *
 * A performance clip usually runs a LOOP several times on one take, so a map
 * can hold several passes' worth of marks. Wrapping is what keeps the notation
 * following the footage through the second, third and fourth time round
 * instead of freezing on the last step once pass one ends.
 */
export function getStepIndexFromVideo(
  currentTime: number,
  stepMap: ReadableStepMap
): number {
  const mark = getHighlightedBeatFromVideo(
    currentTime,
    arrivalTimestamps(stepMap)
  );
  if (mark <= 0) return -1;
  if (stepMap.stepCount <= 0) return mark - 1;
  return (mark - 1) % stepMap.stepCount;
}

/**
 * Which time through the sequence the footage is on right now, 1-based.
 *
 * Zero before the first mark; one from the opening pose onward. A single-pass
 * map only ever answers 1, which is why surfaces showing this hide it unless
 * the take holds more than one.
 */
export function passNumberFromVideo(
  currentTime: number,
  stepMap: ReadableStepMap
): number {
  const mark = getHighlightedBeatFromVideo(
    currentTime,
    arrivalTimestamps(stepMap)
  );
  if (mark < 0) return 0;
  if (mark === 0 || stepMap.stepCount <= 0) return 1;
  return Math.floor((mark - 1) / stepMap.stepCount) + 1;
}

/**
 * When to drive the footage to, to see a given step.
 *
 * Move `stepIndex + 1` lands on arrival `stepIndex + 1`, so that is where the
 * footage has to sit for the notation to light that cell. A take holds every
 * move once per pass, so a step index names several instants rather than one.
 * This returns whichever is nearest the playhead: clicking move 13 while
 * watching the third time through lands on that pass's move 13, not back at
 * the top of the clip. Null when the map holds no instance of that step.
 */
export function seekTimeForStep(
  stepIndex: number,
  currentTime: number,
  stepMap: ReadableStepMap
): number | null {
  const arrivals = arrivalTimestamps(stepMap);
  if (stepIndex < 0 || arrivals.length === 0) return null;

  // Without a step count the map is one pass by definition, so the move
  // appears exactly once and the stride is the whole map.
  const stride =
    stepMap.stepCount > 0 ? stepMap.stepCount : Math.max(1, arrivals.length - 1);
  if (stepIndex >= stride) return null;

  let nearest: number | null = null;
  for (let i = stepIndex + 1; i < arrivals.length; i += stride) {
    const at = arrivals[i]!;
    if (
      nearest === null ||
      Math.abs(at - currentTime) < Math.abs(nearest - currentTime)
    ) {
      nearest = at;
    }
  }
  return nearest;
}

/** How many times the sequence is marked out across the clip. At least one. */
export function passCountFromStepMap(
  stepMap: Pick<StepMap, "beatTimestamps" | "stepCount">
): number {
  if (stepMap.stepCount <= 0) return 1;
  return Math.max(1, Math.ceil(stepMap.beatTimestamps.length / stepMap.stepCount));
}

/**
 * Generate evenly-spaced step timestamps across a video, seeded from BPM.
 * Used as a starting point for manual step mapping - the user can then nudge
 * individual timestamps to match the actual performance.
 *
 * BPM describes the sequence's own tempo, not the video's. When the BPM run
 * would overrun the clip, or leaves most of it unused (a 16-step run at 120 BPM
 * is 8 seconds - meaningless in a 60-second clip), the markers spread across
 * the clip instead so every one of them lands somewhere the user can reach.
 */
export function generateEvenBeatTimestamps(
  videoDuration: number,
  stepCount: number,
  bpm: number,
  startOffset: number = 0
): number[] {
  if (stepCount <= 0) return [];

  const usable = Math.max(0, videoDuration - startOffset);
  const bpmInterval = bpm > 0 ? 60 / bpm : 0;
  const bpmSpan = stepCount * bpmInterval;
  const spreadInterval = usable / stepCount;

  const interval =
    usable > 0 && (bpmSpan > usable || bpmSpan < usable * 0.6)
      ? spreadInterval
      : bpmInterval;

  const timestamps: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    timestamps.push(
      Math.min(startOffset + i * interval, Math.max(0, videoDuration - 0.01))
    );
  }
  return timestamps;
}
