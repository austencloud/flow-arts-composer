import { describe, expect, it } from "vitest";
import {
  arrangementBeatSeconds,
  arrangementBeatToSeconds,
  cellLaneSpan,
  cellOffsetAfterDrag,
} from "#lib/shared/post-studio-plugin/ui/tka-arrangement-lanes";

// A four-second clip at 120 BPM: eight beats, half a second each.
const clip = { start: 10, duration: 4, sourceIn: 0, speed: 1 };

describe("arrangement beats on the timeline", () => {
  it("turns beats into project seconds through the clip's trim and speed", () => {
    expect(arrangementBeatSeconds(120, 1)).toBeCloseTo(0.5);
    expect(arrangementBeatSeconds(120, 2)).toBeCloseTo(0.25);
    expect(arrangementBeatToSeconds(clip, 120, 0)).toBeCloseTo(10);
    expect(arrangementBeatToSeconds(clip, 120, 3)).toBeCloseTo(11.5);
    const trimmed = { ...clip, sourceIn: 1 };
    expect(arrangementBeatToSeconds(trimmed, 120, 2)).toBeCloseTo(10);
    const fast = { ...clip, speed: 2 };
    expect(arrangementBeatToSeconds(fast, 120, 4)).toBeCloseTo(11);
  });
});

describe("cellLaneSpan", () => {
  it("draws the first cycle from the cell's first beat", () => {
    expect(cellLaneSpan(clip, 120, 0, 4)).toEqual({
      startSeconds: 10,
      endSeconds: 12,
      pinned: false,
    });
    expect(cellLaneSpan(clip, 120, 2, 4)).toEqual({
      startSeconds: 11,
      endSeconds: 13,
      pinned: false,
    });
  });

  it("clamps the bar to the clip", () => {
    expect(cellLaneSpan(clip, 120, 6, 4)).toEqual({
      startSeconds: 13,
      endSeconds: 14,
      pinned: false,
    });
  });

  it("shows the first cycle still playing after the trimmed-in point", () => {
    const trimmed = { ...clip, sourceIn: 2.5 };
    // Cycles of four beats at offset 1: beats 1..5 end at 2.5 s, so 5..9 shows.
    expect(cellLaneSpan(trimmed, 120, 1, 4)).toEqual({
      startSeconds: 10,
      endSeconds: 12,
      pinned: false,
    });
    const exact = { ...clip, sourceIn: 2 };
    expect(cellLaneSpan(exact, 120, 0, 4)).toEqual({
      startSeconds: 10,
      endSeconds: 12,
      pinned: false,
    });
  });

  it("pins a bar whose first beat is past the clip's end", () => {
    expect(cellLaneSpan(clip, 120, 8, 4)).toEqual({
      startSeconds: 14,
      endSeconds: 14,
      pinned: true,
    });
    expect(cellLaneSpan(clip, 120, 40, 4).pinned).toBe(true);
  });

  it("shortens the bar for a cell running fast", () => {
    expect(cellLaneSpan(clip, 120, 0, 2)).toEqual({
      startSeconds: 10,
      endSeconds: 11,
      pinned: false,
    });
  });
});

describe("cellOffsetAfterDrag", () => {
  it("snaps to whole beats and never goes below zero", () => {
    expect(cellOffsetAfterDrag(2, 0.6, 0.5, 1)).toBe(3);
    expect(cellOffsetAfterDrag(2, 0.2, 0.5, 1)).toBe(2);
    expect(cellOffsetAfterDrag(1, -3, 0.5, 1)).toBe(0);
  });

  it("snaps to quarter beats when asked", () => {
    expect(cellOffsetAfterDrag(2, 0.3, 0.5, 0.25)).toBeCloseTo(2.5);
    expect(cellOffsetAfterDrag(2, 0.1, 0.5, 0.25)).toBeCloseTo(2.25);
    expect(cellOffsetAfterDrag(0, -0.2, 0.5, 0.25)).toBe(0);
  });
});
