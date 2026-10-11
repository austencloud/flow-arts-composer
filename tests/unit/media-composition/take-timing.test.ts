import { describe, expect, it } from "vitest";
import {
  MIN_MOVE_SECONDS,
  TakeTimingSchema,
  addTakeTap,
  clearTakePerformanceEnd,
  confirmTakeTiming,
  createTakeTiming,
  editTakeSection,
  editTimingSection,
  fitSection,
  landingDragRange,
  mergeTimingSectionIntoPrevious,
  moveBeatOne,
  moveTakeBeatOne,
  placeTakeLanding,
  releaseLanding,
  releaseTakeLanding,
  resolveTakeTiming,
  setBeatOneAt,
  setLandingAt,
  setPerformanceEndAt,
  setTakeBeatOneAt,
  setTakePerformanceEndAt,
  splitTimingSection,
  takeLandingDragRange,
  takePositionAt,
  takeSampleAt,
  takeTimingFromLegacyMarks,
  takeTimingStatus,
  type TakeTiming,
  type TimingSection,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { createBeatClock } from "#lib/shared/media-composition/domain/tap-fit.js";

const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];
const SIXTEEN = Array.from({ length: 16 }, () => 1);
const SPB = 60 / 87;

/** A landing on the 87 BPM grid whose opening pose is at 1 s. */
const at = (position: number) => 1 + SPB * position;
/** Taps on landings `from` through `to`. */
const tapsOn = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => at(from + index));

function timing(sections: Partial<TimingSection>[]): TakeTiming {
  const base = createTakeTiming({
    sequenceId: "dck",
    takeKey: "local:take.mp4:1:1",
    durationSeconds: 60,
    now: 1,
  });
  return {
    ...base,
    sections: sections.map((section, index) => ({
      ...base.sections[0]!,
      id: `section-${index + 1}`,
      ...section,
    })),
  };
}

/** Both takes show the same move at every moment from landing `from` to `to`. */
function expectSameMotion(
  actual: TakeTiming,
  expected: TakeTiming,
  from: number,
  to: number
): void {
  const shown = resolveTakeTiming(actual, EIGHT);
  const wanted = resolveTakeTiming(expected, EIGHT);
  for (let position = from; position <= to; position += 0.05) {
    expect(
      takePositionAt(shown, at(position)),
      `at landing ${position.toFixed(2)}`
    ).toBeCloseTo(takePositionAt(wanted, at(position))!, 3);
  }
}

describe("resolveTakeTiming", () => {
  it("accepts saved hold ratios only from 0 through 0.9", () => {
    expect(TakeTimingSchema.safeParse(timing([{ landingHoldRatio: 0 }])).success).toBe(true);
    expect(TakeTimingSchema.safeParse(timing([{ landingHoldRatio: 0.9 }])).success).toBe(true);
    expect(TakeTimingSchema.safeParse(timing([{ landingHoldRatio: 0.91 }])).success).toBe(false);
  });

  it("holds a landed pose, catches up by the next landing, and preserves the old default", () => {
    const plain = timing([{ taps: tapsOn(1, 5), tempo: "locked" }]);
    const held = resolveTakeTiming(
      { ...plain, sections: [{ ...plain.sections[0]!, landingHoldRatio: 0.4 }] },
      EIGHT
    );
    const original = resolveTakeTiming(plain, EIGHT);
    expect(takePositionAt(original, at(3.25))).toBeCloseTo(3.25, 6);
    expect(takePositionAt(held, at(3))).toBeCloseTo(3, 6);
    expect(takePositionAt(held, at(3.25))).toBeCloseTo(3, 6);
    expect(takePositionAt(held, at(3.7))).toBeCloseTo(3.5, 6);
    expect(takePositionAt(held, at(4))).toBeCloseTo(4, 6);
    expect(takePositionAt(held, at(5.2))).toBeCloseTo(5, 6);
  });

  it("uses each move's actual interval and keeps the setting through a continued split", () => {
    const beats = [1, 2, 1, 2];
    const clock = createBeatClock(beats);
    const landing = (position: number) => 1 + SPB * clock.beatsBefore(position);
    const source = timing([{
      taps: [1, 2, 3, 4, 5, 6].map(landing),
      tempo: "locked",
      landingHoldRatio: 0.5,
    }]);
    const split = splitTimingSection(source, (landing(3) + landing(4)) / 2, "later", 2, beats, "continues");
    expect(split.sections[1]!.landingHoldRatio).toBe(0.5);
    const resolved = resolveTakeTiming(split, beats);
    const halfwayLongMove = landing(1) + (landing(2) - landing(1)) * 0.75;
    expect(takePositionAt(resolved, halfwayLongMove)).toBeCloseTo(1.5, 5);
    const halfwayRightMove = landing(4) + (landing(5) - landing(4)) * 0.75;
    expect(takePositionAt(resolved, halfwayRightMove)).toBeCloseTo(4.5, 5);
    expect(takePositionAt(resolved, landing(5))).toBeCloseTo(5, 5);
  });

  it("holds the prior landing when the opening move began before the video", () => {
    const source = timing([{
      taps: [0.2, 0.2 + SPB, 0.2 + SPB * 2],
      beatOneSeconds: 0.2,
      beatOnePosition: 2,
      tempo: "locked",
      landingHoldRatio: 0.8,
    }]);
    const resolved = resolveTakeTiming(source, EIGHT);
    expect(takePositionAt(resolved, 0)).toBeCloseTo(1, 5);
    expect(takePositionAt(resolved, 0.2)).toBeCloseTo(2, 5);
  });

  it("leaves a section without taps unmapped", () => {
    const resolved = resolveTakeTiming(timing([{}]), EIGHT);
    expect(resolved.sections[0]!.map).toBeNull();
    expect(takePositionAt(resolved, 10)).toBeNull();
  });

  it("lands each position on the fitted grid", () => {
    const origin = 2;
    const taps = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
      (position) => origin + SPB * position
    );
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked" }]),
      EIGHT
    );
    // Opening pose, landings, the move in flight between them, and across
    // the pass boundary at position 8.
    expect(takePositionAt(resolved, origin)).toBeCloseTo(0, 3);
    expect(takePositionAt(resolved, origin + SPB * 3)).toBeCloseTo(3, 3);
    expect(takePositionAt(resolved, origin + SPB * 3.5)).toBeCloseTo(3.5, 3);
    expect(takePositionAt(resolved, origin + SPB * 8)).toBeCloseTo(8, 3);
    expect(takePositionAt(resolved, origin + SPB * 8.25)).toBeCloseTo(8.25, 3);
    // Before the opening pose the performer holds it.
    expect(takePositionAt(resolved, 0.5)).toBeCloseTo(0, 6);
  });

  it("spaces multi-beat moves by their beats", () => {
    const moveBeats = [1, 2, 1];
    const taps = [1, 3, 4, 5, 7].map((beats) => 1 + SPB * beats);
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked" }]),
      moveBeats
    );
    // Move 2 lasts two beats, so halfway through it is one beat after move
    // 1's landing.
    expect(takePositionAt(resolved, 1 + SPB * 2)).toBeCloseTo(1.5, 3);
    expect(takePositionAt(resolved, 1 + SPB * 3)).toBeCloseTo(2, 3);
  });

  it("lands on the taps themselves when snapping to taps", () => {
    const taps = [1, 2, 3, 4, 5, 6].map((position) => 1 + SPB * position);
    taps[2] = taps[2]! + 0.05;
    const grid = resolveTakeTiming(
      timing([{ taps, tempo: "locked", snap: "grid" }]),
      EIGHT
    );
    const snapped = resolveTakeTiming(
      timing([{ taps, tempo: "locked", snap: "taps" }]),
      EIGHT
    );
    expect(takePositionAt(snapped, taps[2]!)).toBeCloseTo(3, 6);
    expect(takePositionAt(grid, taps[2]!)).not.toBeCloseTo(3, 2);
  });

  it("puts a missed landing between its tapped neighbours when snapping", () => {
    const taps = [1, 2, 4, 5].map((position) => 1 + SPB * position);
    taps[2] = taps[2]! + 0.06;
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked", snap: "taps" }]),
      EIGHT
    );
    const landing = resolved.sections[0]!.landings.find(
      (entry) => entry.position === 3
    )!;
    expect(landing.seconds).toBeCloseTo((taps[1]! + taps[2]!) / 2, 6);
  });

  it("pins an overridden landing and keeps landings in order", () => {
    const taps = [1, 2, 3, 4, 5, 6].map((position) => 1 + SPB * position);
    const pinned = resolveTakeTiming(
      timing([
        {
          taps,
          tempo: "locked",
          overrides: [{ position: 4, seconds: 1 + SPB * 4 + 0.1 }],
        },
      ]),
      EIGHT
    );
    expect(takePositionAt(pinned, 1 + SPB * 4 + 0.1)).toBeCloseTo(4, 6);
    expect(pinned.sections[0]!.droppedOverrides).toEqual([]);
  });

  it("sets aside a dragged landing that no longer sits between its neighbours", () => {
    // Pushing later landings a millisecond apart would flash three moves by
    // in three milliseconds; the stale drag goes back on the grid instead.
    const taps = [1, 2, 3, 4, 5, 6].map((position) => 1 + SPB * position);
    const crossed = resolveTakeTiming(
      timing([
        {
          taps,
          tempo: "locked",
          overrides: [{ position: 3, seconds: 1 + SPB * 5 + 0.05 }],
        },
      ]),
      EIGHT
    );
    const section = crossed.sections[0]!;
    expect(section.droppedOverrides).toEqual([3]);
    const landing = section.landings.find((entry) => entry.position === 3)!;
    expect(landing).toMatchObject({ pinned: false });
    expect(landing.seconds).toBeCloseTo(1 + SPB * 3, 3);
    section.landings.slice(1).forEach((entry, index) => {
      expect(entry.seconds - section.landings[index]!.seconds).toBeGreaterThan(
        0.5
      );
    });
  });

  it("sets aside a drag that its reset neighbour now crowds", () => {
    // Landings 1 and 2 dragged half a move late, then the grid nudged a whole
    // move early: landing 2 passes landing 3 and goes back on the grid, which
    // puts it behind landing 1's drag - so that one goes back too, rather than
    // leaving a move a millisecond long.
    const taps = [1, 2, 3, 4, 5, 6, 7, 8].map((position) => 1 + SPB * position);
    const section = resolveTakeTiming(
      timing([
        {
          taps,
          tempo: "locked",
          offsetSeconds: -SPB,
          overrides: [
            { position: 1, seconds: 1 + SPB * 1.5 },
            { position: 2, seconds: 1 + SPB * 2.5 },
          ],
        },
      ]),
      EIGHT
    ).sections[0]!;
    expect(section.droppedOverrides).toEqual([1, 2]);
    section.landings.slice(1).forEach((entry, index) => {
      expect(entry.seconds - section.landings[index]!.seconds).toBeGreaterThan(
        MIN_MOVE_SECONDS
      );
    });
  });

  it("stops a dragged landing a frame short of its neighbours", () => {
    const taps = [1, 2, 3, 4, 5, 6].map((position) => 1 + SPB * position);
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    const range = landingDragRange(section, EIGHT, 4)!;
    expect(range.min).toBeCloseTo(1 + SPB * 3 + MIN_MOVE_SECONDS, 3);
    expect(range.max).toBeCloseTo(1 + SPB * 5 - MIN_MOVE_SECONDS, 3);

    const dragged = setLandingAt(section, EIGHT, 4, 1 + SPB * 7);
    expect(dragged.overrides).toEqual([{ position: 4, seconds: range.max }]);
    const again = setLandingAt(dragged, EIGHT, 4, 1 + SPB * 4 + 0.1);
    expect(again.overrides).toEqual([
      { position: 4, seconds: 1 + SPB * 4 + 0.1 },
    ]);
    expect(releaseLanding(again, 4).overrides).toEqual([]);
  });

  it("refuses a landing dragged twice", () => {
    const twice = timing([
      {
        overrides: [
          { position: 4, seconds: 3 },
          { position: 4, seconds: 3.2 },
        ],
      },
    ]);
    expect(TakeTimingSchema.safeParse(twice).success).toBe(false);
  });

  it("shifts the whole grid by the offset", () => {
    const taps = [1, 2, 3, 4].map((position) => 1 + SPB * position);
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked", offsetSeconds: 0.1 }]),
      EIGHT
    );
    expect(takePositionAt(resolved, 1 + SPB * 2 + 0.1)).toBeCloseTo(2, 3);
  });

  it("keeps the start of a section moving under a nudge of over half a move", () => {
    const taps = Array.from({ length: 20 }, (_, index) => 1 + SPB * (index + 14));
    const resolved = resolveTakeTiming(
      timing([
        {
          startSeconds: 10,
          endSeconds: 60,
          taps,
          beatOneSeconds: 1 + SPB,
          tempo: "locked",
          offsetSeconds: 1,
        },
      ]),
      EIGHT
    );
    expect(takePositionAt(resolved, 10)).toBeCloseTo((10 - 2) / SPB, 2);
    expect(takePositionAt(resolved, 10.4)).toBeCloseTo((10.4 - 2) / SPB, 2);
  });

  it("cuts a grid that reaches back before the file at zero", () => {
    // Opening pose would sit at -0.3 s.
    const taps = [1, 2, 3, 4].map((position) => -0.3 + SPB * position);
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked" }]),
      EIGHT
    );
    const map = resolved.sections[0]!.map!;
    expect(map.anchors[0]!.mediaTimeSeconds).toBe(0);
    expect(map.anchors[0]!.sequencePosition).toBeCloseTo(0.3 / SPB, 3);
    expect(takePositionAt(resolved, 0)).toBeCloseTo(0.3 / SPB, 3);
  });

  it("follows an edited video's full-speed and slow sections separately", () => {
    // Full speed for two passes from 1 s, then the sequence restarts at half
    // speed from 30 s.
    const fastTaps = Array.from({ length: 16 }, (_, index) => 1 + SPB * (index + 1));
    const slowSpb = SPB * 2;
    const slowTaps = Array.from(
      { length: 8 },
      (_, index) => 31 + slowSpb * (index + 1)
    );
    const resolved = resolveTakeTiming(
      timing([
        { startSeconds: 0, endSeconds: 30, taps: fastTaps, tempo: "locked" },
        {
          startSeconds: 30,
          endSeconds: 60,
          bpm: 43.5,
          taps: slowTaps,
          tempo: "locked",
        },
      ]),
      EIGHT
    );
    expect(takePositionAt(resolved, 1 + SPB * 12)).toBeCloseTo(12, 3);
    expect(takePositionAt(resolved, 31 + slowSpb * 3)).toBeCloseTo(3, 3);
    // The fast section holds its last tapped landing up to its cut, then the
    // slow one takes over from its own opening pose.
    expect(takePositionAt(resolved, 29.99)).toBeCloseTo(16, 6);
    expect(takePositionAt(resolved, 30.5)).toBeCloseTo(0, 6);
  });

  it("holds the earlier section's last pose across a gap", () => {
    const taps = [1, 2, 3].map((position) => 1 + SPB * position);
    const resolved = resolveTakeTiming(
      timing([
        { startSeconds: 0, endSeconds: 10, taps, tempo: "locked" },
        { startSeconds: 20, endSeconds: 60 },
      ]),
      EIGHT
    );
    const atEnd = takePositionAt(resolved, 10);
    expect(takePositionAt(resolved, 15)).toBeCloseTo(atEnd!, 9);
  });
});

describe("timing sections", () => {
  it("splits a section and joins it back", () => {
    const taps = [2, 4, 12, 14];
    const original = timing([{ taps }]);
    const split = splitTimingSection(
      original,
      10,
      "section-2",
      5,
      EIGHT,
      "continues"
    );
    expect(split.sections.map((section) => section.taps)).toEqual([
      [2, 4],
      [12, 14],
    ]);
    expect(split.sections[1]!.startSeconds).toBe(10);
    expect(TakeTimingSchema.safeParse(split).success).toBe(true);

    const merged = mergeTimingSectionIntoPrevious(split, "section-2", 6, EIGHT);
    expect(merged.sections).toHaveLength(1);
    expect(merged.sections[0]!.taps).toEqual(taps);
    expect(merged.sections[0]!.endSeconds).toBe(60);
  });

  it("will not split within a quarter second of a section edge", () => {
    const original = timing([{}]);
    expect(
      splitTimingSection(original, 0.1, "section-2", 5, EIGHT, "continues")
    ).toBe(original);
  });

  it("keeps counting across a split where the performance continues", () => {
    const taps = Array.from({ length: 16 }, (_, index) => 1 + SPB * (index + 1));
    const original = timing([{ taps, tempo: "locked" }]);
    const split = splitTimingSection(
      original,
      1 + SPB * 10.5,
      "s2",
      5,
      EIGHT,
      "continues"
    );
    const resolved = resolveTakeTiming(split, EIGHT);
    expect(takePositionAt(resolved, 1 + SPB * 12)).toBeCloseTo(12, 3);
    expect(takePositionAt(resolved, 1 + SPB * 16)).toBeCloseTo(16, 3);
  });

  it("changes nothing on screen when it splits and keeps counting", () => {
    const taps = Array.from({ length: 16 }, (_, index) => 1 + SPB * (index + 1));
    const original = timing([{ taps, tempo: "locked", snap: "taps" }]);
    const cut = 1 + SPB * 10.5;
    const split = splitTimingSection(original, cut, "s2", 5, EIGHT, "continues");
    expect(TakeTimingSchema.safeParse(split).success).toBe(true);
    const before = resolveTakeTiming(original, EIGHT);
    const after = resolveTakeTiming(split, EIGHT);
    // Just short of the cut the left part is still moving, not frozen on its
    // last tap waiting to jump.
    expect(takePositionAt(after, cut - SPB * 0.25)).toBeCloseTo(10.25, 3);
    for (let seconds = 0; seconds <= 20; seconds += 0.37) {
      expect(takePositionAt(after, seconds)).toBeCloseTo(
        takePositionAt(before, seconds)!,
        3
      );
    }
  });

  it("keeps the count when a split leaves a test tap too few taps to set aside", () => {
    // A test tap four landings before move 1 is set aside only while more
    // than three taps follow it. Cut after two, the part before the cut
    // must not start counting from it.
    const original = timing([
      { taps: [at(1), ...tapsOn(5, 16)], tempo: "locked" },
    ]);
    const before = resolveTakeTiming(original, EIGHT);
    expect(before.sections[0]!.fit!.ignoredLeadingTaps).toBe(1);
    expect(takePositionAt(before, at(10))).toBeCloseTo(6, 3);
    const split = splitTimingSection(original, at(6.4), "s2", 5, EIGHT, "continues");
    expectSameMotion(split, original, 0, 20);
  });

  it("keeps counting across a split in the count-in before beat 1", () => {
    // Three count-in taps, beat 1 marked, and a cut between the count-in
    // and the opening pose: the part before it holds only count-in taps.
    const original = timing([
      {
        taps: [...tapsOn(1, 3), ...tapsOn(5, 42)],
        tempo: "locked",
        beatOneSeconds: at(5),
      },
    ]);
    const split = splitTimingSection(original, at(3.6), "s2", 5, EIGHT, "continues");
    expectSameMotion(split, original, 0, 44);
  });

  it("keeps a landing dragged across the cut where it was drawn", () => {
    // Landing 30 dragged 0.3 s late; cuts before the grid landing and
    // between it and the dragged moment.
    const original = timing([
      {
        taps: tapsOn(1, 42),
        tempo: "locked",
        overrides: [{ position: 30, seconds: at(30) + 0.3 }],
      },
    ]);
    for (const cut of [29.6, 29.8, 30.2, 30.4]) {
      const split = splitTimingSection(original, at(cut), "s2", 5, EIGHT, "continues");
      expectSameMotion(split, original, 27, 33);
    }
  });

  it("carries a tempo and beat 1 with no taps across a split", () => {
    const original = timing([
      { startSeconds: 0, endSeconds: 30, bpm: 60, tempo: "locked", beatOneSeconds: 1 },
    ]);
    const split = splitTimingSection(original, 10, "s2", 5, EIGHT, "continues");
    const before = resolveTakeTiming(original, EIGHT);
    const after = resolveTakeTiming(split, EIGHT);
    expect(after.sections[1]!.map).not.toBeNull();
    expect(takePositionAt(after, 20)).toBeCloseTo(
      takePositionAt(before, 20)!,
      6
    );
  });

  it("keeps the end where the performance stopped before a split", () => {
    const taps = Array.from({ length: 12 }, (_, index) => 1 + SPB * (index + 1));
    const original = timing([{ taps, tempo: "locked" }]);
    const split = splitTimingSection(original, 20, "s2", 5, EIGHT, "continues");
    const after = resolveTakeTiming(split, EIGHT);
    expect(after.sections[0]!.endPosition).toBe(12);
    expect(takePositionAt(after, 15)).toBeCloseTo(12, 6);
    expect(takePositionAt(after, 25)).toBeCloseTo(12, 6);
  });

  it("keeps moving up to the cut when the part after it is tapped later", () => {
    // Tapped up to a tempo change, split there, then tapped on.
    const original = timing([{ taps: tapsOn(1, 42), tempo: "locked" }]);
    const split = splitTimingSection(
      original,
      at(42.4),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    // Nothing after the cut says the performer went on, so both parts hold
    // where the taps stop.
    const untapped = resolveTakeTiming(split, EIGHT);
    expect(untapped.sections[0]!.endPosition).toBe(42);
    expect(takePositionAt(untapped, at(42.3))).toBeCloseTo(42, 6);
    expect(takePositionAt(untapped, at(45))).toBeCloseTo(42, 6);

    const tapped = editTimingSection(
      split,
      "s2",
      (section) => ({ ...section, taps: tapsOn(43, 58) }),
      6
    );
    const after = resolveTakeTiming(tapped, EIGHT);
    const unsplit = resolveTakeTiming(
      timing([{ taps: tapsOn(1, 58), tempo: "locked" }]),
      EIGHT
    );
    expect(after.sections[0]!.endPosition).toBeNull();
    expect(takePositionAt(after, at(42.3))).toBeCloseTo(42.3, 3);
    for (let position = 40; position <= 46; position += 0.05) {
      expect(takePositionAt(after, at(position))).toBeCloseTo(
        takePositionAt(unsplit, at(position))!,
        3
      );
    }
  });

  it("keeps an untapped middle part moving once the part after it is tapped", () => {
    // Two cuts past the taps, then only the last part tapped: the part
    // between them counts on instead of holding the guessed end.
    const original = timing([{ taps: tapsOn(1, 42), tempo: "locked" }]);
    const once = splitTimingSection(original, at(45), "s2", 5, EIGHT, "continues");
    const twice = splitTimingSection(once, at(50), "s3", 6, EIGHT, "continues");
    const tapped = editTimingSection(
      twice,
      "s3",
      (section) => ({ ...section, taps: tapsOn(51, 58) }),
      7
    );
    const unsplit = timing([
      { taps: [...tapsOn(1, 42), ...tapsOn(51, 58)], tempo: "locked" },
    ]);
    expectSameMotion(tapped, unsplit, 38, 62);
    expect(resolveTakeTiming(tapped, EIGHT).sections[1]!.endStored).toBe(false);
  });

  it("keeps moving through untapped landings up to a later cut", () => {
    // Taps stop at 12 and start again at 27; the split falls at 27.
    const original = timing([
      { taps: [...tapsOn(1, 12), ...tapsOn(27, 42)], tempo: "locked" },
    ]);
    const split = splitTimingSection(original, at(27), "s2", 5, EIGHT, "continues");
    const after = resolveTakeTiming(split, EIGHT);
    expect(takePositionAt(after, at(18))).toBeCloseTo(18, 3);
    expect(takePositionAt(after, at(26.9))).toBeCloseTo(26.9, 3);
    expect(takePositionAt(after, at(28))).toBeCloseTo(28, 3);
  });

  it("stops the part before a pause once the count after it is set back", () => {
    // The performer lands 12, pauses four moves, and lands 13 at landing
    // 17's moment. Keeping count carries 17 across the cut.
    const original = timing([
      { taps: [...tapsOn(1, 12), ...tapsOn(17, 24)], tempo: "locked" },
    ]);
    const split = splitTimingSection(
      original,
      at(16.6),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    expect(split.sections[1]!.beatOnePosition).toBe(17);
    // Counted straight on, the pause reads as moves.
    expect(takePositionAt(resolveTakeTiming(split, EIGHT), at(15))).toBeCloseTo(
      15,
      3
    );

    const setBack = editTimingSection(
      split,
      "s2",
      (section) => moveBeatOne(section, EIGHT, 4),
      6
    );
    const resolved = resolveTakeTiming(setBack, EIGHT);
    expect(resolved.sections[0]!.endPosition).toBe(12);
    expect(takePositionAt(resolved, at(15))).toBeCloseTo(12, 6);
    expect(takePositionAt(resolved, at(17))).toBeCloseTo(13, 3);
    expect(takePositionAt(resolved, at(20))).toBeCloseTo(16, 3);
  });

  it("pivots a new tempo after a split where the parts meet", () => {
    // Beat 1 and a tempo only, cut just after landing 42.
    const original = timing([
      { bpm: 87, tempo: "locked", beatOneSeconds: at(1) },
    ]);
    const split = splitTimingSection(original, 30, "s2", 5, SIXTEEN, "continues");
    const faster = editTimingSection(
      split,
      "s2",
      (section) => ({ ...section, bpm: 100 }),
      6
    );
    const resolved = resolveTakeTiming(faster, SIXTEEN);
    // Landing 42 sits just before the cut; the new tempo counts on from it,
    // and both parts draw the move across the cut alike, so it runs at the
    // new tempo from landing 42 with no jump at the cut.
    expect(takePositionAt(resolved, 29.99)).toBeCloseTo(
      42 + (29.99 - at(42)) / 0.6,
      6
    );
    expect(takePositionAt(resolved, 30)).toBeCloseTo(
      42 + (30 - at(42)) / 0.6,
      6
    );
    expect(
      takePositionAt(resolved, 30)! - takePositionAt(resolved, 30 - 1e-6)!
    ).toBeLessThan(1e-4);
    // Taps at the new tempo take the count on from there.
    const taps = Array.from({ length: 12 }, (_, index) => at(42) + 0.6 * (index + 1));
    const tapped = editTimingSection(
      faster,
      "s2",
      (section) => ({ ...section, taps }),
      7
    );
    expect(
      fitSection(tapped.sections[1]!, SIXTEEN)!.labels.map(
        (label) => label.position
      )
    ).toEqual(Array.from({ length: 12 }, (_, index) => 43 + index));
  });

  it("counts on through a slower part tapped after the split", () => {
    const original = timing([{ taps: tapsOn(1, 38), tempo: "follow" }]);
    const cut = at(38.6);
    const split = splitTimingSection(original, cut, "s2", 5, EIGHT, "continues");
    // Sixteen more landings, 3% slower from landing 38.
    const slower = Array.from(
      { length: 16 },
      (_, index) => at(38) + SPB * 1.03 * (index + 1)
    );
    const tapped = editTimingSection(
      split,
      "s2",
      (section) => ({ ...section, taps: slower }),
      6
    );
    expect(
      fitSection(tapped.sections[1]!, EIGHT)!.labels.map(
        (label) => label.position
      )
    ).toEqual(Array.from({ length: 16 }, (_, index) => 39 + index));
    const resolved = resolveTakeTiming(tapped, EIGHT);
    expect(
      Math.abs(
        takePositionAt(resolved, cut + 0.001)! -
          takePositionAt(resolved, cut - 0.001)!
      )
    ).toBeLessThan(0.05);
  });

  it("carries a guessed end to an untapped part only until it has taps", () => {
    const original = timing([{ taps: tapsOn(1, 38), tempo: "locked" }]);
    const split = splitTimingSection(
      original,
      at(38.5),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    // The last tap rounds up to the end of the pass.
    expect(split.sections[1]!.carriedEnd).toBe(40);
    expect(split.sections[1]!.lastPosition).toBeUndefined();
    expect(takePositionAt(resolveTakeTiming(split, EIGHT), at(45))).toBeCloseTo(
      40,
      6
    );

    const tapped = editTimingSection(
      split,
      "s2",
      (section) => ({ ...section, taps: tapsOn(39, 54) }),
      6
    );
    const resolved = resolveTakeTiming(tapped, EIGHT);
    expect(resolved.sections[1]!.endPosition).toBe(56);
    expect(takePositionAt(resolved, at(50))).toBeCloseTo(50, 3);

    // Joined straight back, the guess is not kept as an end Austen chose.
    const rejoined = mergeTimingSectionIntoPrevious(split, "s2", 7, EIGHT);
    expect(rejoined.sections[0]!.lastPosition).toBeUndefined();
    expect(rejoined.sections[0]!.carriedEnd).toBeUndefined();
    expect(resolveTakeTiming(rejoined, EIGHT).sections[0]!.endPosition).toBe(40);
  });

  it("stores an end only while it decides where the part stops", () => {
    const split = splitTimingSection(
      timing([{ taps: tapsOn(1, 38), tempo: "locked" }]),
      at(38.5),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    // The untapped part carries the end its taps guessed, and those taps
    // still guess it: nothing stored decides it, so there is nothing to clear.
    expect(split.sections[1]!.carriedEnd).toBe(40);
    expect(resolveTakeTiming(split, EIGHT).sections[1]!.endStored).toBe(false);
    // Tapped, the part guesses its own end; the carried one is kept but
    // decides nothing either.
    const tapped = editTimingSection(
      split,
      "s2",
      (section) => ({ ...section, taps: tapsOn(39, 54) }),
      6
    );
    expect(tapped.sections[1]!.carriedEnd).toBe(40);
    expect(resolveTakeTiming(tapped, EIGHT).sections[1]!.endStored).toBe(false);
    const ended = editTimingSection(
      tapped,
      "s2",
      (section) => setPerformanceEndAt(section, EIGHT, at(50)),
      7
    );
    expect(resolveTakeTiming(ended, EIGHT).sections[1]!.endStored).toBe(true);
  });

  it("holds an end set before the cut through the part after it", () => {
    const section = setPerformanceEndAt(
      timing([{ taps: tapsOn(1, 20), tempo: "locked" }]).sections[0]!,
      EIGHT,
      at(12)
    );
    expect(section.lastPosition).toBe(12);
    const split = splitTimingSection(
      timing([section]),
      at(15.5),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    const resolved = resolveTakeTiming(split, EIGHT);
    expect(takePositionAt(resolved, at(14))).toBeCloseTo(12, 6);
    expect(takePositionAt(resolved, at(18))).toBeCloseTo(12, 6);
  });

  it("keeps an end set past the taps when a split is joined back", () => {
    const ended = setPerformanceEndAt(
      timing([{ taps: tapsOn(1, 16), tempo: "locked" }]).sections[0]!,
      SIXTEEN,
      at(20)
    );
    expect(ended.lastPosition).toBe(20);
    const split = splitTimingSection(
      timing([ended]),
      at(23),
      "s2",
      5,
      SIXTEEN,
      "continues"
    );
    const joined = mergeTimingSectionIntoPrevious(split, "s2", 6, SIXTEEN);
    expect(joined.sections[0]!.lastPosition).toBe(20);
    expect(takePositionAt(resolveTakeTiming(joined, SIXTEEN), 40)).toBeCloseTo(
      20,
      6
    );
  });

  it("joins a slower part back with its end and drag where they were drawn", () => {
    const split = splitTimingSection(
      timing([{ taps: tapsOn(1, 8), tempo: "locked" }]),
      at(8.4),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    // After the cut the performer lands every two beats.
    const slow = (landings: number) => at(8) + 2 * SPB * landings;
    let right: TimingSection = {
      ...split.sections[1]!,
      bpm: 43.5,
      taps: Array.from({ length: 8 }, (_, index) => slow(index + 1)),
    };
    right = setPerformanceEndAt(right, EIGHT, slow(8));
    right = setLandingAt(right, EIGHT, 14, slow(6) + 0.1);
    expect(right.lastPosition).toBe(16);
    // Joined at the earlier tempo, each moment takes the joined count.
    const joined = mergeTimingSectionIntoPrevious(
      { ...split, sections: [split.sections[0]!, right] },
      "s2",
      6,
      EIGHT
    );
    const [section] = joined.sections;
    expect(section!.lastPosition).toBe(24);
    expect(section!.overrides).toEqual([
      { position: 20, seconds: slow(6) + 0.1 },
    ]);
    expect(
      resolveTakeTiming(joined, EIGHT).sections[0]!.droppedOverrides
    ).toEqual([]);
  });

  it("leaves an end before a restart with the part before it", () => {
    const ended = setPerformanceEndAt(
      timing([{ taps: tapsOn(1, 22), tempo: "locked" }]).sections[0]!,
      EIGHT,
      at(20)
    );
    const restarted = splitTimingSection(
      timing([ended]),
      40,
      "s2",
      5,
      EIGHT,
      "restarts"
    );
    expect(restarted.sections[0]!.lastPosition).toBe(20);
    expect(
      takePositionAt(resolveTakeTiming(restarted, EIGHT), at(23))
    ).toBeCloseTo(20, 6);

    // Cut just after the end, with taps after it: the end is not carried
    // over renumbered to the part that starts over.
    const justAfter = splitTimingSection(
      timing([ended]),
      at(20.5),
      "s2",
      5,
      EIGHT,
      "restarts"
    );
    expect(justAfter.sections[0]!.lastPosition).toBe(20);
    expect(justAfter.sections[1]!.lastPosition).toBeUndefined();

    // Joined straight back, the end holds the whole take again.
    const rejoined = mergeTimingSectionIntoPrevious(justAfter, "s2", 6, EIGHT);
    expect(rejoined.sections[0]!.lastPosition).toBe(20);
    expectSameMotion(rejoined, timing([ended]), 0, 30);
  });

  it("joins a restarted part back without two drags on one landing", () => {
    const fast = Array.from({ length: 16 }, (_, index) => 1 + SPB * (index + 1));
    const later = Array.from({ length: 8 }, (_, index) => 14 + SPB * (index + 1));
    const original = timing([{ taps: [...fast, ...later], tempo: "locked" }]);
    const split = splitTimingSection(original, 13.5, "later", 5, EIGHT, "restarts");
    // Landing 2 dragged on each side, and an end on the later part.
    const dragged = editTimingSection(
      editTimingSection(
        split,
        "section-1",
        (section) => setLandingAt(section, EIGHT, 2, 1 + SPB * 2 + 0.05),
        6
      ),
      "later",
      (section) => ({
        ...setLandingAt(section, EIGHT, 2, 14 + SPB * 2 + 0.05),
        lastPosition: 8,
      }),
      7
    );
    expect(dragged.sections.map((section) => section.overrides.length)).toEqual([
      1, 1,
    ]);
    const merged = mergeTimingSectionIntoPrevious(dragged, "later", 8, EIGHT);
    expect(TakeTimingSchema.safeParse(merged).success).toBe(true);
    const [section] = merged.sections;
    const positions = section!.overrides.map((override) => override.position);
    expect(new Set(positions).size).toBe(positions.length);
    // The later part's landing 2 and end take the joined count at the same
    // moments: it restarted after landing 18 of the joined count.
    const resolved = resolveTakeTiming(merged, EIGHT);
    const laterDrag = section!.overrides.find(
      (override) => Math.abs(override.seconds - (14 + SPB * 2 + 0.05)) < 1e-9
    );
    expect(laterDrag).toBeDefined();
    expect(takePositionAt(resolved, laterDrag!.seconds)).toBeCloseTo(
      laterDrag!.position,
      6
    );
    expect(section!.lastPosition).toBe(laterDrag!.position + 6);
  });

  it("starts over at move 1 where an edited video replays slowly", () => {
    // An InShot export: sixteen landings at full speed, then the same moves
    // from the opening pose at half speed.
    const fast = Array.from({ length: 16 }, (_, index) => 1 + SPB * (index + 1));
    const replay = (position: number) => 14 + 2 * SPB * position;
    const slow = Array.from({ length: 8 }, (_, index) => replay(index + 1));
    const original = timing([{ taps: [...fast, ...slow], tempo: "locked" }]);
    const split = splitTimingSection(
      original,
      13.5,
      "slow",
      5,
      EIGHT,
      "restarts"
    );
    expect(split.sections[1]!.firstTapPosition).toBe(1);
    const halfSpeed = editTimingSection(
      split,
      "slow",
      (section) => ({ ...section, bpm: 43.5 }),
      6
    );
    const resolved = resolveTakeTiming(halfSpeed, EIGHT);
    expect(takePositionAt(resolved, 1 + SPB * 12)).toBeCloseTo(12, 3);
    expect(takePositionAt(resolved, replay(3))).toBeCloseTo(3, 3);
    expect(takePositionAt(resolved, replay(3.5))).toBeCloseTo(3.5, 3);
  });

  it("draws every drag beside a cut where it was, however many", () => {
    // The performer rushed: landing 9 dragged 0.4 s early, and 10 to just
    // after it, still before 9's grid moment. The cut falls on 10's grid
    // moment, so both drags sit before it.
    let rushed = timing([{ taps: tapsOn(1, 20), tempo: "locked" }]).sections[0]!;
    rushed = setLandingAt(rushed, EIGHT, 9, at(9) - 0.4);
    rushed = setLandingAt(rushed, EIGHT, 10, at(9) - 0.2);
    const pair = timing([rushed]);
    const splitPair = splitTimingSection(pair, at(10), "s2", 5, EIGHT, "continues");
    expect(
      resolveTakeTiming(splitPair, EIGHT).sections.map(
        (section) => section.droppedOverrides
      )
    ).toEqual([[], []]);
    expectSameMotion(splitPair, pair, 7, 13);

    // Three landings dragged into one move, the cut in the middle of them.
    let bunched = timing([{ taps: tapsOn(1, 16), tempo: "locked" }]).sections[0]!;
    for (const [position, landing] of [
      [5, 4.2],
      [6, 4.4],
      [7, 4.6],
    ] as const) {
      bunched = setLandingAt(bunched, EIGHT, position, at(landing));
    }
    const three = timing([bunched]);
    const splitThree = splitTimingSection(three, at(4.5), "s2", 5, EIGHT, "continues");
    expect(takePositionAt(resolveTakeTiming(splitThree, EIGHT), at(4.5))).toBeCloseTo(
      6.5,
      3
    );
    expectSameMotion(splitThree, three, 2, 10);
  });

  it("draws a landing dragged beside a cut the same from either part", () => {
    const original = timing([{ taps: tapsOn(1, 40), tempo: "locked" }]);
    const cut = at(20.5);
    const draggedFirst = splitTimingSection(
      editTimingSection(
        original,
        "section-1",
        (section) => setLandingAt(section, EIGHT, 20, at(20.3)),
        2
      ),
      cut,
      "s2",
      3,
      EIGHT,
      "continues"
    );
    const split = splitTimingSection(original, cut, "s2", 3, EIGHT, "continues");
    // Dragged after the split, from the part before the cut or after it.
    const fromLeft = placeTakeLanding(split, "section-1", 20, at(20.3), EIGHT);
    const fromRight = placeTakeLanding(split, "s2", 20, at(20.3), EIGHT);
    expectSameMotion(fromLeft, draggedFirst, 17, 24);
    expectSameMotion(fromRight, draggedFirst, 17, 24);
    // Dragged again from the other part, one drag stands.
    const again = placeTakeLanding(fromLeft, "s2", 20, at(20.2), EIGHT);
    expect(
      again.sections.flatMap((section) => section.overrides)
    ).toEqual([{ position: 20, seconds: at(20.2) }]);
    // Released from either part, it goes back on the grid for both.
    expectSameMotion(releaseTakeLanding(fromLeft, "s2", 20, EIGHT), split, 17, 24);
    expectSameMotion(releaseTakeLanding(fromRight, "section-1", 20, EIGHT), split, 17, 24);
  });

  it("keeps landings snapped to taps where they were across a cut", () => {
    // Landing 10 tapped 0.15 s late; the cut falls between it and 11.
    const late = timing([
      {
        taps: tapsOn(1, 20).map((tap, index) => (index === 9 ? tap + 0.15 : tap)),
        tempo: "locked",
        snap: "taps",
      },
    ]);
    expectSameMotion(
      splitTimingSection(late, at(10.5), "s2", 5, EIGHT, "continues"),
      late,
      7,
      14
    );
    // Uneven taps either side of the cut.
    const uneven = timing([
      { taps: [1, 2.1, 3, 4.2, 5, 6.1, 7, 8].map(at), tempo: "locked", snap: "taps" },
    ]);
    const split = splitTimingSection(uneven, at(4.5), "s2", 5, EIGHT, "continues");
    expect(takePositionAt(resolveTakeTiming(split, EIGHT), at(4.5))).toBeCloseTo(
      4.375,
      3
    );
    expectSameMotion(split, uneven, 1, 9);
  });

  it("gives each tap to the part its landing is drawn in", () => {
    // The grid nudged 0.3 s earlier: landing 20 is drawn at at(20) - 0.3 and
    // the performance holds it. The cut falls between it and its tap.
    const original = timing([
      { taps: tapsOn(1, 20), tempo: "locked", offsetSeconds: -0.3 },
    ]);
    const cut = at(20) - 0.2;
    const split = splitTimingSection(original, cut, "s2", 5, EIGHT, "continues");
    expect(split.sections.map((section) => section.taps.length)).toEqual([20, 0]);
    expectSameMotion(split, original, 17, 24);
    // A tap made after the split goes the same way.
    const retapped = addTakeTap(
      { ...split, sections: [{ ...split.sections[0]!, taps: tapsOn(1, 19) }, split.sections[1]!] },
      at(20),
      EIGHT
    );
    expect(retapped.sections.map((section) => section.taps.length)).toEqual([20, 0]);
  });

  it("keeps counting across a cut in a mixed-beat sequence", () => {
    // Move 21 lasts two beats; the cut falls halfway through it, and the
    // part after the cut holds two taps.
    const mixed = [1, 2, 1, 1, 2, 1, 1, 3];
    const clock = createBeatClock(mixed);
    const land = (position: number) => 4 + SPB * clock.beatsBefore(position);
    const original = timing([
      { taps: Array.from({ length: 22 }, (_, index) => land(index + 1)), tempo: "locked" },
    ]);
    const split = splitTimingSection(
      original,
      (land(20) + land(21)) / 2,
      "s2",
      5,
      mixed,
      "continues"
    );
    expect(
      fitSection(split.sections[1]!, mixed)!.labels.map((label) => label.position)
    ).toEqual([21, 22]);
    expect(takePositionAt(resolveTakeTiming(split, mixed), land(21))).toBeCloseTo(
      21,
      3
    );
  });

  it("counts on from a start-over cut inside a keep-counting chain", () => {
    // An edited video: moves 1-20, then the replay starts over, its move 1
    // landing at landing 22's moment. The tempo changes later in the
    // replay. Either cut can come first.
    const original = timing([
      { taps: [...tapsOn(1, 20), ...tapsOn(22, 51)], tempo: "locked" },
    ]);
    const countedFirst = splitTimingSection(
      splitTimingSection(original, at(36.5), "c", 5, EIGHT, "continues"),
      at(21),
      "r",
      6,
      EIGHT,
      "restarts"
    );
    const restartedFirst = splitTimingSection(
      splitTimingSection(original, at(21), "r", 5, EIGHT, "restarts"),
      at(36.5),
      "c",
      6,
      EIGHT,
      "continues"
    );
    expect(
      takePositionAt(resolveTakeTiming(countedFirst, EIGHT), at(37.5))
    ).toBeCloseTo(16.5, 3);
    expectSameMotion(countedFirst, restartedFirst, 0, 55);

    // Three parts the other way round: keep counting late, then start over
    // early, and the last part counts on from the restart.
    const short = timing([{ taps: tapsOn(1, 16), tempo: "locked" }]);
    const chained = splitTimingSection(
      splitTimingSection(short, at(10.5), "tail", 5, EIGHT, "continues"),
      at(4.5),
      "middle",
      6,
      EIGHT,
      "restarts"
    );
    const resolved = resolveTakeTiming(chained, EIGHT);
    expect(takePositionAt(resolved, at(10))).toBeCloseTo(6, 3);
    expect(takePositionAt(resolved, at(11))).toBeCloseTo(7, 3);
  });

  it("counts on from a start-over joined back into the part before it", () => {
    const original = timing([{ taps: tapsOn(1, 16), tempo: "locked" }]);
    const chained = splitTimingSection(
      splitTimingSection(original, at(4.5), "middle", 5, EIGHT, "restarts"),
      at(10.5),
      "tail",
      6,
      EIGHT,
      "continues"
    );
    const joined = mergeTimingSectionIntoPrevious(chained, "middle", 7, EIGHT);
    expect(takePositionAt(resolveTakeTiming(joined, EIGHT), at(11))).toBeCloseTo(
      11,
      3
    );
    expectSameMotion(
      joined,
      splitTimingSection(original, at(10.5), "tail", 6, EIGHT, "continues"),
      0,
      20
    );
  });

  it("holds through a pause after an untapped part, whichever cut came first", () => {
    // Moves 1-12, a four-move pause, then move 13 lands at landing 17's
    // moment. One cut at the pause's end sets the count back four; another
    // falls inside the pause.
    const original = timing([
      { taps: [...tapsOn(1, 12), ...tapsOn(17, 36)], tempo: "locked" },
    ]);
    const setBack = (take: TakeTiming) =>
      [1, 2, 3, 4].reduce((out) => moveTakeBeatOne(out, "c", EIGHT, 1), take);
    const pauseFirst = splitTimingSection(
      setBack(splitTimingSection(original, at(16.9), "c", 5, EIGHT, "continues")),
      at(14.5),
      "b",
      6,
      EIGHT,
      "continues"
    );
    const cutsFirst = setBack(
      splitTimingSection(
        splitTimingSection(original, at(14.5), "b", 5, EIGHT, "continues"),
        at(16.9),
        "c",
        6,
        EIGHT,
        "continues"
      )
    );
    for (const take of [pauseFirst, cutsFirst]) {
      const resolved = resolveTakeTiming(take, EIGHT);
      for (const landing of [12.5, 14, 15.5, 16.8]) {
        expect(takePositionAt(resolved, at(landing)), `at ${landing}`).toBeCloseTo(
          12,
          6
        );
      }
      expect(takePositionAt(resolved, at(18))).toBeCloseTo(14, 3);
    }
  });

  it("rejects overlapping sections", () => {
    const overlapping = timing([
      { startSeconds: 0, endSeconds: 20 },
      { startSeconds: 10, endSeconds: 30 },
    ]);
    expect(TakeTimingSchema.safeParse(overlapping).success).toBe(false);
  });
});

describe("takeTimingFromLegacyMarks", () => {
  it("reproduces the old step map's arrivals exactly", () => {
    // Uneven, hand-tapped marks: mark 0 is the opening pose.
    const marks = [0.8, 1.52, 2.18, 2.95, 3.61, 4.33, 5.02, 5.7, 6.41];
    const legacy = takeTimingFromLegacyMarks({
      sequenceId: "dck",
      takeKey: "local:take.mp4:1:1",
      durationSeconds: 12,
      marks,
      endMark: 7.1,
      now: 1,
    })!;
    expect(TakeTimingSchema.safeParse(legacy).success).toBe(true);
    const resolved = resolveTakeTiming(legacy, EIGHT);
    [...marks, 7.1].forEach((seconds, position) => {
      expect(takePositionAt(resolved, seconds)).toBeCloseTo(position, 6);
    });
    // The performance ends on the end mark and holds there.
    expect(takePositionAt(resolved, 11)).toBeCloseTo(9, 6);
  });

  it("leaves the opening pose out of the fit, however long it was held", () => {
    // The performer holds the opening pose 2.2 s before moving. Fitted with
    // the rest, that mark once pushed every label two moves on.
    const marks = [0.5, 2.7, ...[1, 2, 3, 4, 5, 6, 7].map((k) => 2.7 + SPB * k)];
    const legacy = takeTimingFromLegacyMarks({
      sequenceId: "dck",
      takeKey: "k",
      durationSeconds: 12,
      marks,
      now: 1,
    })!;
    const section = resolveTakeTiming(legacy, EIGHT).sections[0]!;
    // With no end mark the old map closed one typical move after the last
    // mark, so that landing is kept as move 9.
    expect(section.fit!.labels.map((label) => label.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(section.endPosition).toBe(9);
    expect(section.droppedOverrides).toEqual([]);
    const resolved = resolveTakeTiming(legacy, EIGHT);
    expect(takePositionAt(resolved, 1.6)).toBeCloseTo(0.5, 3);
    expect(takePositionAt(resolved, 11)).toBeCloseTo(9, 6);
  });

  it("keeps the last move of a map saved without an end mark", () => {
    // Eight moves, one a second, and no end mark: the old map closed on a
    // landing one median move after the last mark.
    const legacy = takeTimingFromLegacyMarks({
      sequenceId: "dck",
      takeKey: "k",
      durationSeconds: 10,
      marks: [0, 1, 2, 3, 4, 5, 6, 7],
      now: 1,
    })!;
    const resolved = resolveTakeTiming(legacy, EIGHT);
    expect(resolved.sections[0]!.endPosition).toBe(8);
    expect(takePositionAt(resolved, 7.5)).toBeCloseTo(7.5, 6);
    expect(takePositionAt(resolved, 9)).toBeCloseTo(8, 6);
  });

  it("closes a map no later than the end of its file", () => {
    const legacy = takeTimingFromLegacyMarks({
      sequenceId: "dck",
      takeKey: "k",
      durationSeconds: 7.4,
      marks: [0, 1, 2, 3, 4, 5, 6, 7],
      now: 1,
    })!;
    const resolved = resolveTakeTiming(legacy, EIGHT);
    expect(takePositionAt(resolved, 7.4)).toBeCloseTo(8, 6);
  });

  it("returns null for marks that cannot make a map", () => {
    const base = {
      sequenceId: "dck",
      takeKey: "k",
      durationSeconds: 10,
      now: 1,
    };
    expect(takeTimingFromLegacyMarks({ ...base, marks: [1] })).toBeNull();
    expect(
      takeTimingFromLegacyMarks({ ...base, marks: [1, 2, 1.5] })
    ).toBeNull();
  });
});

describe("where a performance ends", () => {
  const taps = Array.from({ length: 12 }, (_, index) => 1 + SPB * (index + 1));

  it("holds the last tapped landing instead of running on", () => {
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked" }]),
      EIGHT
    );
    expect(resolved.sections[0]!.endPosition).toBe(12);
    expect(takeSampleAt(resolved, 1 + SPB * 11.5)).toMatchObject({
      endArrival: 12,
    });
    expect(takePositionAt(resolved, 1 + SPB * 11.5)).toBeCloseTo(11.5, 3);
    expect(takePositionAt(resolved, 1 + SPB * 12)).toBeCloseTo(12, 3);
    expect(takePositionAt(resolved, 50)).toBeCloseTo(12, 6);
  });

  it("runs on to where Austen says the performance ends", () => {
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    const extended = setPerformanceEndAt(section, EIGHT, 1 + SPB * 20 + 0.1);
    expect(extended.lastPosition).toBe(20);
    const resolved = resolveTakeTiming(timing([extended]), EIGHT);
    expect(takePositionAt(resolved, 1 + SPB * 18)).toBeCloseTo(18, 3);
    expect(takePositionAt(resolved, 50)).toBeCloseTo(20, 6);
  });

  it("ends on the landing drawn where Austen stops, dragged or not", () => {
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    // Landing 2 dragged most of a move late, still short of landing 3.
    const late = 1 + SPB * 2.9;
    const dragged = setLandingAt(section, EIGHT, 2, late);
    expect(dragged.overrides).toEqual([{ position: 2, seconds: late }]);
    expect(setPerformanceEndAt(dragged, EIGHT, late).lastPosition).toBe(2);
    // Past the last tapped landing the grid carries on.
    expect(
      setPerformanceEndAt(dragged, EIGHT, 1 + SPB * 14.1).lastPosition
    ).toBe(14);
  });

  it("ends on the last drawn landing when it was dragged late", () => {
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    // The last tapped landing, dragged most of a move late.
    const late = setLandingAt(section, EIGHT, 12, at(12.9));
    expect(setPerformanceEndAt(late, EIGHT, at(12.9)).lastPosition).toBe(12);

    // An end past the taps, then a landing past them dragged late.
    const extended = setPerformanceEndAt(section, EIGHT, at(20));
    const dragged = setLandingAt(extended, EIGHT, 16, at(16.9));
    expect(dragged.overrides).toEqual([{ position: 16, seconds: at(16.9) }]);
    expect(setPerformanceEndAt(dragged, EIGHT, at(16.9)).lastPosition).toBe(16);
  });

  it("rounds a last tap just short of the pass end up to it", () => {
    // Austen stops tapping a landing early; the performer finishes the pass.
    const upTo = (count: number) =>
      Array.from({ length: count }, (_, index) => 1 + SPB * (index + 1));
    const endOf = (count: number) =>
      resolveTakeTiming(
        timing([{ taps: upTo(count), tempo: "locked" }]),
        SIXTEEN
      ).sections[0]!.endPosition;
    expect(endOf(15)).toBe(16);
    expect(endOf(14)).toBe(16);
    expect(endOf(13)).toBe(13);
    expect(endOf(16)).toBe(16);
  });

  it("runs a tempo and beat 1 with no taps to the end of the take", () => {
    const resolved = resolveTakeTiming(
      timing([{ beatOneSeconds: 1 + SPB, tempo: "locked" }]),
      EIGHT
    );
    expect(resolved.sections[0]!.endPosition).toBeNull();
    expect(takePositionAt(resolved, 1 + SPB * 40)).toBeCloseTo(40, 3);
  });

  it("keeps an end clearable when a nudge leaves nothing to map", () => {
    // Ended on landing 1, then the grid nudged four frames earlier: every
    // landing up to the end falls before the file starts.
    const four = [1, 1, 1, 1];
    const ended = setPerformanceEndAt(
      timing([{ taps: [0.1, 1.1, 2.1, 3.1], bpm: 60, tempo: "locked" }]).sections[0]!,
      four,
      0.1
    );
    expect(ended.lastPosition).toBe(1);
    const nudged = timing([{ ...ended, offsetSeconds: -4 / 30 }]);
    const resolved = resolveTakeTiming(nudged, four).sections[0]!;
    expect(resolved.map).toBeNull();
    expect(resolved.endStored).toBe(true);
  });
});

describe("beat 1", () => {
  const taps = Array.from({ length: 16 }, (_, index) => 1 + SPB * (index + 1));

  it("renumbers from the landing Austen marks", () => {
    // He tapped from the opening pose, so the first tap is not move 1.
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    const marked = setBeatOneAt(section, EIGHT, 1 + SPB * 2 + 0.05);
    const fit = fitSection(marked, EIGHT)!;
    expect(fit.labels[0]!.position).toBe(0);
    expect(fit.labels[1]!.position).toBe(1);
    // Taps added before the mark later cannot shift it.
    const withEarlyTap = { ...marked, taps: [0.2, ...marked.taps] };
    expect(fitSection(withEarlyTap, EIGHT)!.labels[2]!.position).toBe(1);
  });

  it("can move to a moment ahead of every tap", () => {
    // A test tap 3 landings before the performer started became move 1.
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    const marked = setBeatOneAt(section, EIGHT, 1 + SPB * -2);
    expect(fitSection(marked, EIGHT)!.labels[0]!.position).toBe(4);
  });

  it("moves by whole landings", () => {
    const section = timing([{ taps, tempo: "locked" }]).sections[0]!;
    const later = moveBeatOne(section, EIGHT, 1);
    expect(fitSection(later, EIGHT)!.labels[1]!.position).toBe(1);
    const back = moveBeatOne(later, EIGHT, -1);
    expect(fitSection(back, EIGHT)!.labels[0]!.position).toBe(1);
  });

  it("keeps a count carried across a split marked at the cut", () => {
    const split = splitTimingSection(
      timing([{ taps, tempo: "locked" }]),
      at(10.4),
      "s2",
      5,
      EIGHT,
      "continues"
    );
    const right = split.sections[1]!;
    expect(right.beatOnePosition).toBe(10);
    const mark = right.beatOneSeconds!;
    expect(mark).toBeCloseTo(at(10), 9);
    const labelsOf = (section: TimingSection) =>
      fitSection(section, EIGHT)!.labels.map((label) => label.position);
    expect(labelsOf(right)).toEqual([11, 12, 13, 14, 15, 16]);

    // Moved by two, the mark stays at the cut and takes the new number.
    const moved = moveBeatOne(right, EIGHT, 2);
    expect(moved.beatOneSeconds).toBe(mark);
    expect(moved.beatOnePosition).toBe(8);
    expect(labelsOf(moved)).toEqual([9, 10, 11, 12, 13, 14]);

    // Down to move 1 there, it needs no carried count.
    const one = moveBeatOne(right, EIGHT, 9);
    expect(one.beatOneSeconds).toBe(mark);
    expect(one.beatOnePosition).toBeUndefined();
    expect(labelsOf(one)).toEqual([2, 3, 4, 5, 6, 7]);

    // Marking beat 1 by hand starts the count from that landing.
    const marked = setBeatOneAt(right, EIGHT, at(12));
    expect(marked.beatOnePosition).toBeUndefined();
    expect(labelsOf(marked)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("renumbers the parts that keep its count with the part before them", () => {
    // The first tap was the opening pose. Fixing beat 1 after a split
    // matches fixing it before.
    const original = timing([{ taps: tapsOn(1, 58), tempo: "locked" }]);
    const split = splitTimingSection(original, at(42.4), "s2", 5, EIGHT, "continues");
    const unsplit = editTimingSection(
      original,
      "section-1",
      (section) => setBeatOneAt(section, EIGHT, at(2)),
      6
    );
    expectSameMotion(setTakeBeatOneAt(split, "section-1", EIGHT, at(2)), unsplit, 0, 60);
    expectSameMotion(moveTakeBeatOne(split, "section-1", EIGHT, 1), unsplit, 0, 60);
  });

  it("moves a carried count's mark when renumbering takes it below move 1", () => {
    const original = timing([{ taps: tapsOn(1, 24), tempo: "locked" }]);
    const split = splitTimingSection(original, at(2.4), "s2", 5, EIGHT, "continues");
    expect(split.sections[1]!.beatOnePosition).toBe(2);
    // Beat 1 three landings later: the cut's landing 2 would be move -1.
    const moved = moveTakeBeatOne(split, "section-1", EIGHT, 3);
    const unsplit = editTimingSection(
      original,
      "section-1",
      (section) => setBeatOneAt(section, EIGHT, at(4)),
      6
    );
    expectSameMotion(moved, unsplit, 0, 30);
  });

  it("renumbers a mixed-beat part after the cut by where its landings fall", () => {
    // Two-beat moves, and the first tap was move 4's landing, taken as move
    // 1. Cut to keep counting between moves 20 and 21, then move 1's real
    // landing marked on the first part.
    const mixed = [1, 2, 1, 1, 2, 1, 1, 1];
    const clock = createBeatClock(mixed);
    const land = (position: number) => 1 + SPB * clock.beatsBefore(position);
    const original = timing([
      { taps: Array.from({ length: 50 }, (_, index) => land(index + 4)), tempo: "locked" },
    ]);
    const cut = (land(20) + land(21)) / 2 - 0.05;
    const fixedAfter = setTakeBeatOneAt(
      splitTimingSection(original, cut, "s2", 5, mixed, "continues"),
      "section-1",
      mixed,
      land(1)
    );
    const fixedBefore = splitTimingSection(
      editTimingSection(original, "section-1", (section) => setBeatOneAt(section, mixed, land(1)), 6),
      cut,
      "s2",
      5,
      mixed,
      "continues"
    );
    const labelsAfterCut = (take: TakeTiming) =>
      fitSection(take.sections[1]!, mixed)!.labels.map((label) => label.position);
    expect(labelsAfterCut(fixedBefore)[0]).toBe(21);
    expect(labelsAfterCut(fixedAfter)).toEqual(labelsAfterCut(fixedBefore));
    expect(takePositionAt(resolveTakeTiming(fixedAfter, mixed), land(21))).toBeCloseTo(
      21,
      3
    );
  });

  it("guesses a carried end again when beat 1 moves before the cut", () => {
    // Tapped through move 21, then cut to keep counting in the held stretch
    // after it. Beat 1 was really a landing earlier, so the last tap is move
    // 22, near enough the pass end to round up to 24.
    const original = timing([{ taps: tapsOn(1, 21), tempo: "locked" }]);
    const cut = at(30.4);
    const movedAfter = moveTakeBeatOne(
      splitTimingSection(original, cut, "s2", 5, EIGHT, "continues"),
      "section-1",
      EIGHT,
      -1
    );
    const movedBefore = splitTimingSection(
      editTimingSection(original, "section-1", (section) => moveBeatOne(section, EIGHT, -1), 6),
      cut,
      "s2",
      5,
      EIGHT,
      "continues"
    );
    expect(movedAfter.sections[1]!.carriedEnd).toBe(24);
    expectSameMotion(movedAfter, movedBefore, 0, 50);

    // Two cuts in the held stretch, and beat 1 a landing later: both parts
    // after them hold move 29.
    const twice = splitTimingSection(
      splitTimingSection(
        timing([{ taps: tapsOn(1, 30), tempo: "locked" }]),
        at(30.4),
        "s2",
        5,
        EIGHT,
        "continues"
      ),
      at(45.4),
      "s3",
      6,
      EIGHT,
      "continues"
    );
    const later = setTakeBeatOneAt(twice, "section-1", EIGHT, at(2));
    expect(later.sections.slice(1).map((section) => section.carriedEnd)).toEqual([
      29, 29,
    ]);
  });

  it("carries dragged landings and the end with their moments", () => {
    const dragged = 1 + SPB * 5 + 0.05;
    const section: TimingSection = {
      ...timing([{ taps, tempo: "locked" }]).sections[0]!,
      overrides: [{ position: 5, seconds: dragged }],
      lastPosition: 14,
    };
    const shifted = moveBeatOne(section, EIGHT, 1);
    expect(shifted.overrides).toEqual([{ position: 4, seconds: dragged }]);
    expect(shifted.lastPosition).toBe(13);
    const resolved = resolveTakeTiming(timing([shifted]), EIGHT);
    const landings = resolved.sections[0]!.landings;
    // No move squeezed to nothing around the dragged landing.
    landings.slice(1).forEach((landing, index) => {
      expect(landing.seconds - landings[index]!.seconds).toBeGreaterThan(
        SPB / 2
      );
    });
  });
});

describe("parts that share a count", () => {
  /** How far the count jumps across a cut. */
  function jumpAt(take: TakeTiming, cut: number): number {
    const resolved = resolveTakeTiming(take, EIGHT);
    return (
      takePositionAt(resolved, cut + 0.001)! -
      takePositionAt(resolved, cut - 0.001)!
    );
  }
  /** Taps on whole seconds: the 60 BPM grid from move 1. */
  const everySecond = (count: number) =>
    Array.from({ length: count }, (_, index) => index + 1);

  it("counts on from a part that started over once it is tapped", () => {
    // Moves 1-4 and 9-16 tapped; the stretch between is cut to keep
    // counting at 7.5 s, then to start over at 4.5 s.
    let take = timing([
      { bpm: 60, tempo: "locked", taps: [1, 2, 3, 4, ...everySecond(16).slice(8)] },
    ]);
    take = splitTimingSection(take, 7.5, "tail", 2, EIGHT, "continues");
    take = splitTimingSection(take, 4.5, "middle", 3, EIGHT, "restarts");
    for (const seconds of [5, 6, 7]) take = addTakeTap(take, seconds, EIGHT);
    const resolved = resolveTakeTiming(take, EIGHT);
    expect(takePositionAt(resolved, 5)).toBeCloseTo(1, 6);
    expect(takePositionAt(resolved, 7)).toBeCloseTo(3, 6);
    expect(takePositionAt(resolved, 9)).toBeCloseTo(5, 6);
  });

  it("stops a drag at the landing drawn next across a cut", () => {
    let take = timing([{ bpm: 60, tempo: "locked", taps: everySecond(16) }]);
    take = splitTimingSection(take, 5.2, "fast", 2, EIGHT, "continues");
    // The later part cleared, typed faster and ended at 8 s.
    take = editTakeSection(take, "fast", EIGHT, (section) => ({
      ...section,
      taps: [],
      bpm: 120,
    }));
    take = setTakePerformanceEndAt(take, "fast", EIGHT, 8);
    expect(take.sections[1]!.lastPosition).toBe(11);
    // Landing 6 is drawn at 5.5 s at the new tempo.
    const range = takeLandingDragRange(take, "section-1", 5, EIGHT)!;
    expect(range.max).toBeCloseTo(5.5 - MIN_MOVE_SECONDS, 6);
    const dragged = placeTakeLanding(take, "section-1", 5, 5.8, EIGHT);
    const resolved = resolveTakeTiming(dragged, EIGHT);
    const drawn = resolved.sections.map(
      (section) =>
        section.landings.find((landing) => landing.position === 5)!.seconds
    );
    expect(drawn[0]).toBeCloseTo(5.5 - MIN_MOVE_SECONDS, 6);
    expect(drawn[1]).toBeCloseTo(drawn[0]!, 9);
    expect(
      resolved.sections.flatMap((section) => section.droppedOverrides)
    ).toEqual([]);
  });

  it("holds a last landing dragged before a cut made after it", () => {
    const take = timing([{ bpm: 60, tempo: "locked", taps: everySecond(8) }]);
    const dragged = placeTakeLanding(take, "section-1", 8, 7.2, EIGHT);
    const split = splitTimingSection(dragged, 7.5, "tail", 2, EIGHT, "continues");
    const resolved = resolveTakeTiming(split, EIGHT);
    expect(takePositionAt(resolved, 7.4)).toBeCloseTo(8, 6);
    expect(takePositionAt(resolved, 7.6)).toBeCloseTo(8, 6);
  });

  it("keeps a followed tempo slower than any typed one across a cut", () => {
    const land = (position: number) => 4 + 3.12 * position;
    const base = createTakeTiming({
      sequenceId: "dck",
      takeKey: "local:take.mp4:1:1",
      durationSeconds: 150,
      bpm: 20,
      now: 1,
    });
    const take = setTakePerformanceEndAt(
      {
        ...base,
        sections: [
          {
            ...base.sections[0]!,
            tempo: "follow",
            taps: Array.from({ length: 30 }, (_, index) => land(index + 1)),
          },
        ],
      },
      "section-1",
      EIGHT,
      land(40)
    );
    expect(take.sections[0]!.lastPosition).toBe(40);
    const split = splitTimingSection(take, land(30.25), "tail", 2, EIGHT, "continues");
    const end = resolveTakeTiming(split, EIGHT).sections[1]!.landings.find(
      (landing) => landing.position === 40
    )!;
    expect(end.seconds).toBeCloseTo(land(40), 6);
  });

  it("holds the last tapped landing across a cut made after the taps", () => {
    const split = splitTimingSection(
      timing([{ tempo: "locked", taps: tapsOn(1, 9) }]),
      at(30.5),
      "right",
      2,
      EIGHT,
      "continues"
    );
    expect(split.sections[1]!.carriedEnd).toBe(9);
    // Moves 10-20 tapped afterwards, all before the cut.
    const more = tapsOn(10, 20).reduce(
      (take, seconds) => addTakeTap(take, seconds, EIGHT),
      split
    );
    expect(more.sections.map((section) => section.taps.length)).toEqual([20, 0]);
    const resolved = resolveTakeTiming(more, EIGHT);
    expect(takeSampleAt(resolved, at(30.4))!.arrival).toBeCloseTo(20, 6);
    expect(takeSampleAt(resolved, at(30.6))!.arrival).toBeCloseTo(20, 6);
  });

  it("holds an end set in one part through the others", () => {
    const original = timing([{ tempo: "locked", taps: tapsOn(1, 38) }]);
    const split = splitTimingSection(original, at(38.5), "b", 5, EIGHT, "continues");
    expect(split.sections[1]!.carriedEnd).toBe(40);
    const ended = setTakePerformanceEndAt(split, "section-1", EIGHT, at(30));
    expect(ended.sections.map((section) => section.lastPosition)).toEqual([
      30,
      undefined,
    ]);
    expect(ended.sections[1]!.carriedEnd).toBeUndefined();
    const resolved = resolveTakeTiming(ended, EIGHT);
    expect(takePositionAt(resolved, at(34))).toBeCloseTo(30, 3);
    expect(takePositionAt(resolved, at(39.5))).toBeCloseTo(30, 3);

    // Ended from the part after a cut just past landing 38: that landing is
    // drawn before the cut, so the end is stored there and holds both sides.
    const near = at(38.2);
    const early = splitTimingSection(original, near, "b", 5, EIGHT, "continues");
    const stopped = setTakePerformanceEndAt(early, "b", EIGHT, at(38.3));
    expect(stopped.sections.map((section) => section.lastPosition)).toEqual([
      38,
      undefined,
    ]);
    const held = resolveTakeTiming(stopped, EIGHT);
    expect(takePositionAt(held, near - 0.001)).toBeCloseTo(38, 3);
    expect(takePositionAt(held, near + 0.001)).toBeCloseTo(38, 3);
    expect(held.sections.map((section) => section.endStored)).toEqual([
      true,
      true,
    ]);
  });

  it("clears an end for every part that shares it", () => {
    const split = splitTimingSection(
      timing([{ tempo: "locked", taps: tapsOn(1, 24) }]),
      at(40.5),
      "right",
      2,
      EIGHT,
      "continues"
    );
    const ended = setTakePerformanceEndAt(split, "right", EIGHT, at(30));
    expect(ended.sections[0]!.lastPosition).toBe(30);
    const cleared = clearTakePerformanceEnd(ended, "right", EIGHT);
    expect(
      cleared.sections.map((section) => [
        section.lastPosition,
        section.carriedEnd,
      ])
    ).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect(clearTakePerformanceEnd(cleared, "right", EIGHT)).toBe(cleared);
  });

  it("recounts the part after a nudged part whose beat 1 moves", () => {
    const cut = at(20.52);
    const split = splitTimingSection(
      timing([{ tempo: "locked", taps: tapsOn(1, 40) }]),
      cut,
      "s2",
      5,
      EIGHT,
      "continues"
    );
    const nudged = editTakeSection(split, "section-1", EIGHT, (section) => ({
      ...section,
      offsetSeconds: MIN_MOVE_SECONDS,
    }));
    expect(Math.abs(jumpAt(nudged, cut))).toBeLessThan(0.1);
    for (const landings of [1, -1]) {
      const moved = moveTakeBeatOne(nudged, "section-1", EIGHT, landings);
      expect(
        Math.abs(jumpAt(moved, cut)),
        `beat 1 moved ${landings}`
      ).toBeLessThan(0.1);
    }

    // A start-over cut made after the nudge recounts the part after it.
    const replay = splitTimingSection(
      timing([{ tempo: "locked", taps: [...tapsOn(1, 20), ...tapsOn(22, 51)] }]),
      at(36.52),
      "c",
      5,
      EIGHT,
      "continues"
    );
    const restarted = splitTimingSection(
      editTakeSection(replay, "section-1", EIGHT, (section) => ({
        ...section,
        offsetSeconds: MIN_MOVE_SECONDS,
      })),
      at(21),
      "r",
      7,
      EIGHT,
      "restarts"
    );
    expect(Math.abs(jumpAt(restarted, at(36.52)))).toBeLessThan(0.1);
  });

  it("counts on from a part's new tempo, whichever came first", () => {
    const original = timing([
      { taps: tapsOn(1, 24), tempo: "locked", lastPosition: 64 },
    ]);
    const first = splitTimingSection(original, at(24.5), "b", 5, EIGHT, "continues");
    const slow = (take: TakeTiming) =>
      editTakeSection(take, "b", EIGHT, (section) => ({ ...section, bpm: 70 }));
    const cut = at(40.5);
    const tempoFirst = splitTimingSection(slow(first), cut, "c", 7, EIGHT, "continues");
    const cutsFirst = slow(splitTimingSection(first, cut, "c", 7, EIGHT, "continues"));
    expect(Math.abs(jumpAt(tempoFirst, cut))).toBeLessThan(0.1);
    expect(Math.abs(jumpAt(cutsFirst, cut))).toBeLessThan(0.1);
    expectSameMotion(cutsFirst, tempoFirst, 20, 60);

    // Tapping a part that started over counts the part after it on too.
    const cuts = splitTimingSection(
      splitTimingSection(
        timing([{ taps: tapsOn(1, 20), tempo: "locked", lastPosition: 60 }]),
        at(36.5),
        "c",
        5,
        EIGHT,
        "continues"
      ),
      at(21),
      "r",
      6,
      EIGHT,
      "restarts"
    );
    const replayed = tapsOn(22, 36).reduce(
      (take, seconds) => addTakeTap(take, seconds, EIGHT),
      cuts
    );
    // The replay's move 15 lands where landing 36 did.
    expect(Math.abs(jumpAt(replayed, at(36.5)))).toBeLessThan(0.05);
    expect(
      takePositionAt(resolveTakeTiming(replayed, EIGHT), at(36.5))
    ).toBeCloseTo(15.5, 1);
  });

  it("keeps counting across a cut saved before parts marked it", () => {
    // Saved before cuts were marked: the left flagged, the right numbering
    // its taps from the landing it continued from.
    const taps = [1, 2.1, 3, 4.2, 5, 6.1, 7, 8].map(at);
    const whole = timing([{ taps, tempo: "locked", snap: "taps" }]);
    const cut = at(4.5);
    const saved = timing([
      {
        taps: taps.slice(0, 4),
        tempo: "locked",
        snap: "taps",
        endSeconds: cut,
        continuesIntoNext: true,
      },
      {
        taps: taps.slice(4),
        tempo: "locked",
        snap: "taps",
        startSeconds: cut,
        firstTapPosition: 5,
      },
    ]);
    const resolved = resolveTakeTiming(saved, EIGHT);
    expect(resolved.sections[1]!.fit!.labels[0]!.position).toBe(5);
    expect(resolved.sections[1]!.countsWithPrevious).toBe(true);
    expectSameMotion(saved, whole, 1, 9);
    // Either part can drag the landing beside the cut.
    const wanted = placeTakeLanding(whole, "section-1", 5, at(4.6), EIGHT);
    for (const id of ["section-1", "section-2"]) {
      expectSameMotion(placeTakeLanding(saved, id, 5, at(4.6), EIGHT), wanted, 3, 7);
    }
  });

  it("marks move 1 at the playhead on a nudged part with nothing fitted", () => {
    const cleared = timing([{ offsetSeconds: -0.1 }]);
    const marked = setTakeBeatOneAt(cleared, "section-1", EIGHT, 2);
    expect(
      resolveTakeTiming(marked, EIGHT).sections[0]!.landings.find(
        (landing) => landing.position === 1
      )!.seconds
    ).toBeCloseTo(2, 6);

    const split = splitTimingSection(
      timing([{ taps: tapsOn(1, 12), offsetSeconds: -0.1 }]),
      20,
      "s2",
      2,
      EIGHT,
      "restarts"
    );
    const restarted = setTakeBeatOneAt(split, "s2", EIGHT, 22);
    expect(
      resolveTakeTiming(restarted, EIGHT).sections[1]!.landings.find(
        (landing) => landing.position === 1
      )!.seconds
    ).toBeCloseTo(22, 6);
  });
});

describe("takeTimingStatus", () => {
  const taps = [1, 2, 3, 4].map((position) => 1 + SPB * position);

  it("asks for a check after tapping and remembers it", () => {
    expect(takeTimingStatus(timing([{}]), EIGHT)).toBe("untapped");
    const tapped = timing([{ taps }]);
    expect(takeTimingStatus(tapped, EIGHT)).toBe("unconfirmed");
    const confirmed = confirmTakeTiming(tapped, EIGHT, 9);
    expect(takeTimingStatus(confirmed, EIGHT)).toBe("confirmed");
    expect(TakeTimingSchema.safeParse(confirmed).success).toBe(true);
    // Any edit needs a fresh look.
    const edited = editTimingSection(
      confirmed,
      "section-1",
      (section) => ({ ...section, offsetSeconds: 0.03 }),
      10
    );
    expect(takeTimingStatus(edited, EIGHT)).toBe("unconfirmed");
  });

  it("flags a take confirmed against a sequence that has changed", () => {
    const confirmed = confirmTakeTiming(timing([{ taps }]), EIGHT, 9);
    expect(takeTimingStatus(confirmed, [...EIGHT, 1])).toBe("stale");
  });
});
