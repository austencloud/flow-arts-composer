import { describe, expect, it } from "vitest";
import {
  arrivalTimestamps,
  getStepIndexFromVideo,
  passCountFromStepMap,
  passNumberFromVideo,
  seekTimeForStep,
} from "#lib/shared/video-collaboration/utils/step-map-utils.js";

/**
 * The real map Austen marked by hand for OmLam-XJ.mp4: 43.67 seconds of
 * footage running the 16-move LOOP ΩΛ-XJ four times over, 65 taps. Hand-built
 * fixtures would space the marks evenly and hide exactly the bugs these
 * functions exist to prevent, so this is the take.
 *
 * Every tap is an arrival. Tap 0 is the opening pose; tap k is the landing of
 * move k, wrapping every 16.
 */
const OM_LAM_XJ_MARKS = [
  0.0, 0.86, 1.55, 2.07, 2.69, 3.4, 3.94, 4.59, 5.18, 5.76, 6.45, 7.11, 7.7,
  8.36, 8.94, 9.49, 10.17, 10.8, 11.36, 12.0, 12.61, 13.23, 14.02, 14.54, 15.17,
  15.88, 16.46, 17.09, 17.71, 18.33, 18.89, 19.49, 20.26, 20.86, 21.52, 22.15,
  22.83, 23.42, 24.05, 24.66, 25.32, 26.0, 26.61, 27.19, 27.89, 28.48, 29.07,
  29.65, 30.37, 31.04, 31.69, 32.37, 32.93, 33.64, 34.25, 34.89, 35.57, 36.21,
  36.87, 37.54, 38.21, 39.03, 39.67, 40.24, 40.81,
];

/** Every mark but the last launches a move; the last is the closing arrival. */
const fourPass = {
  beatTimestamps: OM_LAM_XJ_MARKS.slice(0, -1),
  endTimestamp: OM_LAM_XJ_MARKS[OM_LAM_XJ_MARKS.length - 1],
  stepCount: 16,
};

/** The same take marked one time through: 17 taps for 16 moves. */
const onePass = {
  beatTimestamps: OM_LAM_XJ_MARKS.slice(0, 16),
  endTimestamp: OM_LAM_XJ_MARKS[16],
  stepCount: 16,
};

describe("reading a multi-pass map", () => {
  it("puts the closing arrival back in the list", () => {
    expect(arrivalTimestamps(fourPass)).toHaveLength(65);
    // A map saved before the editor collected an end mark simply has one less.
    expect(
      arrivalTimestamps({ beatTimestamps: [1, 2, 3], stepCount: 3 })
    ).toEqual([1, 2, 3]);
  });

  it("counts the passes the take actually holds", () => {
    expect(passCountFromStepMap(fourPass)).toBe(4);
    expect(passCountFromStepMap(onePass)).toBe(1);
  });

  it("shows the shape that landed, not the one being travelled to", () => {
    // 0.86 is the tap for move 1, so move 1 is what the notation holds from
    // there until move 2 lands at 1.55. Reading it as move 2 would run the
    // card a whole shape ahead of the footage.
    expect(getStepIndexFromVideo(0.9, fourPass)).toBe(0);
    expect(getStepIndexFromVideo(1.5, fourPass)).toBe(0);
    expect(getStepIndexFromVideo(1.6, fourPass)).toBe(1);
    expect(getStepIndexFromVideo(7.2, fourPass)).toBe(10);
  });

  it("holds the opening pose until the first move lands", () => {
    expect(getStepIndexFromVideo(0, fourPass)).toBe(-1);
    expect(getStepIndexFromVideo(0.5, fourPass)).toBe(-1);
  });

  it("wraps to move one when the performer goes round again", () => {
    // A LOOP closes onto its own opening pose, so 10.17 is move 16 landing -
    // the end of pass one - and move 1 of pass two lands at 10.80.
    expect(getStepIndexFromVideo(10.2, fourPass)).toBe(15);
    expect(getStepIndexFromVideo(10.9, fourPass)).toBe(0);
    expect(getStepIndexFromVideo(20.3, fourPass)).toBe(15);
    expect(getStepIndexFromVideo(30.4, fourPass)).toBe(15);
  });

  it("keeps following the footage to the end of the clip", () => {
    // The bug this replaced froze on step 15 for three quarters of the take.
    expect(getStepIndexFromVideo(40.3, fourPass)).toBe(14);
    // Past the closing arrival the last move is what stays on screen.
    expect(getStepIndexFromVideo(41, fourPass)).toBe(15);
  });

  it("reports nothing before the first mark", () => {
    expect(getStepIndexFromVideo(-1, fourPass)).toBe(-1);
    expect(passNumberFromVideo(-1, fourPass)).toBe(0);
  });

  it("names which time through the sequence is playing", () => {
    expect(passNumberFromVideo(0.5, fourPass)).toBe(1);
    expect(passNumberFromVideo(10.9, fourPass)).toBe(2);
    expect(passNumberFromVideo(20.9, fourPass)).toBe(3);
    expect(passNumberFromVideo(40.5, fourPass)).toBe(4);
    expect(passNumberFromVideo(40.5, onePass)).toBe(1);
  });
});

describe("seeking the footage to a step", () => {
  it("lands in the pass being watched, not back at the top", () => {
    // Move 1 lands at 0.86, 10.80, 20.86 and 31.04. Watching pass three should
    // stay in pass three.
    expect(seekTimeForStep(0, 20.5, fourPass)).toBe(20.86);
    expect(seekTimeForStep(0, 31.0, fourPass)).toBe(31.04);
    expect(seekTimeForStep(0, 0.4, fourPass)).toBe(0.86);
  });

  it("takes the nearest instance even when it is behind the playhead", () => {
    // Move 13 lands at 8.36, 18.33, 28.48 and 39.03. At 18.5 the nearest is
    // the one just passed, not the one coming up.
    expect(seekTimeForStep(12, 18.5, fourPass)).toBe(18.33);
    expect(seekTimeForStep(12, 23.5, fourPass)).toBe(28.48);
  });

  it("resolves every move in the sequence", () => {
    for (let step = 0; step < 16; step++) {
      expect(seekTimeForStep(step, 0, fourPass)).toBe(OM_LAM_XJ_MARKS[step + 1]);
    }
  });

  it("can reach the last move of the last pass", () => {
    // Move 16 of pass four lands on the closing arrival, which lives outside
    // beatTimestamps. Searching the marks alone would never find it.
    expect(seekTimeForStep(15, 43, fourPass)).toBe(40.81);
  });

  it("has one answer per step on a single-pass map", () => {
    expect(seekTimeForStep(3, 0, onePass)).toBe(2.69);
    expect(seekTimeForStep(3, 999, onePass)).toBe(2.69);
  });

  it("returns nothing when the step is not in the map", () => {
    expect(seekTimeForStep(-1, 5, fourPass)).toBeNull();
    expect(seekTimeForStep(16, 5, fourPass)).toBeNull();
    expect(
      seekTimeForStep(0, 5, { beatTimestamps: [], stepCount: 16 })
    ).toBeNull();
  });

  it("treats a map with no step count as a single pass", () => {
    // Three arrivals is an opening pose and two moves.
    const countless = { beatTimestamps: [1, 2, 3], stepCount: 0 };
    expect(seekTimeForStep(0, 99, countless)).toBe(2);
    expect(seekTimeForStep(1, 99, countless)).toBe(3);
    expect(seekTimeForStep(2, 0, countless)).toBeNull();
  });
});
