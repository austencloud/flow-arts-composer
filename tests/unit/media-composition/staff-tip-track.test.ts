import { describe, expect, it } from "vitest";
import {
  StaffTipTrackSchema,
  TIP_FILLED,
  TIP_MISSING,
  TIP_SEEN,
  staffTipAt,
  staffTipCoverage,
  staffTipPath,
  staffTipsAt,
  type StaffTipSeries,
  type StaffTipTrack,
} from "$lib/shared/media-composition/domain/staff-tip-track";

/** One end moving right 0.1 per sample, with the given states. */
function series(states: number[]): StaffTipSeries {
  return {
    x: states.map((state, index) => (state === TIP_MISSING ? -1 : index * 0.1)),
    y: states.map((state) => (state === TIP_MISSING ? -1 : 0.5)),
    state: states,
  };
}

const EMPTY = (count: number) => series(Array(count).fill(TIP_MISSING));

/** 10 samples a second from 1 s: blue end A seen, with a gap at samples 3 and 4. */
function track(): StaffTipTrack {
  const states = [TIP_SEEN, TIP_SEEN, TIP_FILLED, TIP_MISSING, TIP_MISSING, TIP_SEEN];
  return StaffTipTrackSchema.parse({
    version: 1,
    sourceWidth: 1080,
    sourceHeight: 1920,
    sampleRate: 10,
    firstSampleSeconds: 1,
    sampleCount: states.length,
    staffs: [
      { color: "blue", ends: [series(states), EMPTY(states.length)] },
      { color: "red", ends: [EMPTY(states.length), EMPTY(states.length)] },
    ],
  });
}

describe("staff tip track", () => {
  it("rejects an end whose samples do not match the count", () => {
    const bad = { ...track(), sampleCount: 7 };
    expect(StaffTipTrackSchema.safeParse(bad).success).toBe(false);
  });

  it("blends between the samples around a media time", () => {
    const at = staffTipAt(track(), 0, 0, 1.05)!;
    expect(at.x).toBeCloseTo(0.05, 9);
    expect(at.y).toBeCloseTo(0.5, 9);
    expect(at.filled).toBe(false);
    expect(staffTipAt(track(), 0, 0, 1.15)!.filled).toBe(true);
  });

  it("has no position in a gap or outside the take, but does on a sample beside a gap", () => {
    expect(staffTipAt(track(), 0, 0, 1.25)).toBeNull();
    expect(staffTipAt(track(), 0, 0, 1.35)).toBeNull();
    expect(staffTipAt(track(), 0, 0, 0.5)).toBeNull();
    expect(staffTipAt(track(), 0, 0, 2)).toBeNull();
    expect(staffTipAt(track(), 0, 0, 1.2)!.x).toBeCloseTo(0.2, 9);
  });

  it("lists only the ends present, with their staff colour", () => {
    expect(staffTipsAt(track(), 1.05)).toEqual([
      { staff: 0, end: 0, color: "blue", x: expect.closeTo(0.05, 9), y: 0.5, filled: false },
    ]);
  });

  it("splits a path at a gap so a trail never bridges it", () => {
    const runs = staffTipPath(track(), 0, 0, 1, 1.5);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.map((point) => point.seconds)).toEqual([1, 1.1, 1.2]);
    expect(runs[1]!.map((point) => point.seconds)).toEqual([1.5]);
    expect(staffTipPath(track(), 0, 0, 1.2, 1.2)).toEqual([]);
  });

  it("counts found ends across every staff", () => {
    // 4 of 6 samples on one of four ends.
    expect(staffTipCoverage(track())).toBeCloseTo(4 / 24, 9);
  });
});
