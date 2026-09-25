import { describe, expect, it } from "vitest";
import {
  TakeTimingSchema,
  createTakeTiming,
  mergeTimingSectionIntoPrevious,
  resolveTakeTiming,
  splitTimingSection,
  takePositionAt,
  takeTimingFromLegacyMarks,
  type TakeTiming,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";

const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];
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

    // An override dragged past its neighbour cannot run the map backwards.
    const crossed = resolveTakeTiming(
      timing([
        {
          taps,
          tempo: "locked",
          overrides: [{ position: 3, seconds: 1 + SPB * 5 }],
        },
      ]),
      EIGHT
    );
    const seconds = crossed.sections[0]!.landings.map((entry) => entry.seconds);
    seconds.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThan(seconds[index]!);
    });
  });

  it("shifts the whole grid by the offset", () => {
    const taps = [1, 2, 3, 4].map((position) => 1 + SPB * position);
    const resolved = resolveTakeTiming(
      timing([{ taps, tempo: "locked", offsetSeconds: 0.1 }]),
      EIGHT
    );
    expect(takePositionAt(resolved, 1 + SPB * 2 + 0.1)).toBeCloseTo(2, 3);
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
    // The fast section keeps moving up to its cut, then the slow one takes
    // over from its own opening pose.
    expect(takePositionAt(resolved, 29.99)).toBeCloseTo((29.99 - 1) / SPB, 3);
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
    const split = splitTimingSection(original, 10, "section-2", 5);
    expect(split.sections.map((section) => section.taps)).toEqual([
      [2, 4],
      [12, 14],
    ]);
    expect(split.sections[1]!.startSeconds).toBe(10);
    expect(TakeTimingSchema.safeParse(split).success).toBe(true);

    const merged = mergeTimingSectionIntoPrevious(split, "section-2", 6);
    expect(merged.sections).toHaveLength(1);
    expect(merged.sections[0]!.taps).toEqual(taps);
    expect(merged.sections[0]!.endSeconds).toBe(60);
  });

  it("will not split within a quarter second of a section edge", () => {
    const original = timing([{}]);
    expect(splitTimingSection(original, 0.1, "section-2", 5)).toBe(original);
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
