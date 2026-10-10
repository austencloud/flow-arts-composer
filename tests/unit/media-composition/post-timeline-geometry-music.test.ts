import { describe, expect, it } from "vitest";
import { placeDraggedMusic } from "#lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.js";

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

  it("shows no guide for a snap that the clamp to 0 would undo", () => {
    // Bar 1 sounds 2 s in. Dragged left it reaches 0.48 s, 0.02 s from a cut
    // at 0.5 s, but sitting on the cut needs a start of -1.5 s. The clamp
    // leaves bar 1 at 2 s, so nothing snapped.
    expect(placeDraggedMusic(-1.52, [0, 30, 2], [0.5], 100)).toEqual({
      start: 0,
      guideSeconds: null,
    });
  });

  it("uses another anchor's snap when the closest one would start before 0", () => {
    // At a start of 0.02 s bar 1 reaches 2.02 s, 0.03 s from a cut at 1.99 s,
    // but sitting on it needs a start of -0.01 s. The start is 0.05 s from a
    // cut at 0.07 s, and can take that one.
    expect(placeDraggedMusic(0.02, [0, 30, 2], [1.99, 0.07], 100)).toEqual({
      start: 0.07,
      guideSeconds: 0.07,
    });
  });

  it("keeps the guide for a snap that puts the start exactly at 0", () => {
    // Bar 1 sounds 2 s in, so a start of 0 puts it on a cut at 2 s. Nothing
    // is clamped, so the snap happened.
    expect(placeDraggedMusic(0.03, [0, 30, 2], [2], 100)).toEqual({
      start: 0,
      guideSeconds: 2,
    });
  });
});
