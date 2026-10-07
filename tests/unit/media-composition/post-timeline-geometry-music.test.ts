import { describe, expect, it } from "vitest";
import { placeDraggedMusic } from "$lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry";

describe("placeDraggedMusic", () => {
  // 100 px/s with the default 8 px threshold snaps within 0.08 s.
  it("rounds the start to a frame when nothing is near", () => {
    const placed = placeDraggedMusic(3.01, [0, 2], [], 100);
    expect(placed.start).toBeCloseTo(3, 10);
    expect(placed.guideSeconds).toBeNull();
  });

  it("snaps the start to a nearby target", () => {
    expect(placeDraggedMusic(10.05, [0, 30], [10], 100)).toEqual({
      start: 10,
      guideSeconds: 10,
    });
  });

  it("snaps the end instead when the end is the closer one", () => {
    // The end lands at 9.97, 0.03 s from 10. The start is 0.07 s from 8.04.
    expect(placeDraggedMusic(7.97, [0, 2], [8.04, 10], 100)).toEqual({
      start: 8,
      guideSeconds: 10,
    });
  });

  it("puts bar 1 on a cut", () => {
    // Bar 1 sounds 0.25 s in, so it reaches 5.05 and snaps to the cut at 5.1.
    const placed = placeDraggedMusic(4.8, [0, 30, 0.25], [5.1], 100);
    expect(placed.start).toBeCloseTo(4.85, 10);
    expect(placed.guideSeconds).toBe(5.1);
  });

  it("picks whichever anchor is closest to its target", () => {
    // The start is 0.03 s from 2.03; bar 1 is 0.02 s from 2.52.
    const placed = placeDraggedMusic(2, [0, 10, 0.5], [2.03, 2.52], 100);
    expect(placed.start).toBeCloseTo(2.02, 10);
    expect(placed.guideSeconds).toBe(2.52);
  });

  it("never lands before 0", () => {
    expect(placeDraggedMusic(-3, [0, 2], [], 100).start).toBe(0);
    expect(placeDraggedMusic(-0.04, [0, 2], [0], 100)).toEqual({
      start: 0,
      guideSeconds: 0,
    });
  });
});
