import { describe, expect, it } from "vitest";
import {
  MIN_MOVE_SECONDS,
  TakeTimingSchema,
  confirmTakeTiming,
  createTakeTiming,
  editTimingSection,
  fitSection,
  landingDragRange,
  mergeTimingSectionIntoPrevious,
  moveBeatOne,
  releaseLanding,
  resolveTakeTiming,
  setBeatOneAt,
  setLandingAt,
  setPerformanceEndAt,
  splitTimingSection,
  takePositionAt,
  takeSampleAt,
  takeTimingFromLegacyMarks,
  takeTimingStatus,
  type TakeTiming,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";

const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];
const SIXTEEN = Array.from({ length: 16 }, () => 1);
const SPB = 60 / 87;

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

describe("resolveTakeTiming", () => {
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
