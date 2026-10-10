import { describe, expect, it } from "vitest";
import {
  POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND,
  POST_TIMELINE_MAX_PIXELS_PER_SECOND,
  POST_TIMELINE_MIN_PIXELS_PER_SECOND,
  autoScrollForPlayhead,
  clampPixelsPerSecond,
  fitPixelsPerSecond,
  mainTrackDropIndex,
  overlayRowAtPointerY,
  pixelsToSeconds,
  placeDraggedOverlay,
  revealPlayheadScrollLeft,
  roundToFrameSeconds,
  rowsYWithoutKeyLanes,
  rulerTickInterval,
  scrollLeftForStableAnchor,
  secondsToPixels,
  snapToTargets,
} from "#lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.js";

describe("clampPixelsPerSecond", () => {
  it("passes through values already in range", () => {
    expect(clampPixelsPerSecond(120)).toBe(120);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampPixelsPerSecond(1)).toBe(POST_TIMELINE_MIN_PIXELS_PER_SECOND);
    expect(clampPixelsPerSecond(10000)).toBe(
      POST_TIMELINE_MAX_PIXELS_PER_SECOND
    );
  });

  it("falls back to the default for a non-finite input", () => {
    expect(clampPixelsPerSecond(Number.NaN)).toBe(
      POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND
    );
    expect(clampPixelsPerSecond(Number.POSITIVE_INFINITY)).toBe(
      POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND
    );
  });

  it("zooms smoothly from a fitted long timeline without jumping to the usual minimum", () => {
    const fitZoom = fitPixelsPerSecond(77.69, 220);
    expect(clampPixelsPerSecond(fitZoom * 1.25, fitZoom)).toBeCloseTo(
      fitZoom * 1.25
    );
    expect(clampPixelsPerSecond(fitZoom / 1.25, fitZoom)).toBe(fitZoom);
    expect(clampPixelsPerSecond(1, 100)).toBe(
      POST_TIMELINE_MIN_PIXELS_PER_SECOND
    );
  });
});

describe("secondsToPixels / pixelsToSeconds", () => {
  it("round-trip through a given zoom", () => {
    const pps = 42;
    expect(pixelsToSeconds(secondsToPixels(3.5, pps), pps)).toBeCloseTo(3.5);
  });

  it("treats a zero or negative pixels-per-second as zero seconds, not a divide-by-zero", () => {
    expect(pixelsToSeconds(100, 0)).toBe(0);
  });
});

describe("roundToFrameSeconds", () => {
  it("snaps to the nearest frame at the given frame rate", () => {
    // 30fps: frames land on multiples of 1/30 ≈ 0.0333s.
    expect(roundToFrameSeconds(1.0111, 30)).toBeCloseTo(1, 5);
    expect(roundToFrameSeconds(1.02, 30)).toBeCloseTo(1 + 1 / 30, 5);
  });

  it("leaves the value alone when the frame rate is not usable", () => {
    expect(roundToFrameSeconds(1.2345, 0)).toBe(1.2345);
  });
});

describe("fitPixelsPerSecond", () => {
  it("fits the viewport width to the duration", () => {
    expect(fitPixelsPerSecond(10, 1000)).toBe(100);
  });

  it("clamps a fit that would zoom in past the maximum", () => {
    // A 1-second post in a 4000px viewport would ask for 4000px/s.
    expect(fitPixelsPerSecond(1, 4000)).toBe(
      POST_TIMELINE_MAX_PIXELS_PER_SECOND
    );
  });

  it.each([
    [77.69, 220],
    [10_000, 500],
  ])(
    "fits the entire %s-second post in %s pixels even below the usual minimum",
    (duration, width) => {
      const zoom = fitPixelsPerSecond(duration, width);
      expect(zoom).toBeLessThan(POST_TIMELINE_MIN_PIXELS_PER_SECOND);
      expect(secondsToPixels(duration, zoom)).toBeCloseTo(width);
    }
  );

  it("falls back to the default when there is nothing to fit yet", () => {
    expect(fitPixelsPerSecond(0, 1000)).toBe(
      POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND
    );
    expect(fitPixelsPerSecond(10, 0)).toBe(
      POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND
    );
    expect(fitPixelsPerSecond(Infinity, 500)).toBe(
      POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND
    );
    expect(fitPixelsPerSecond(10, Infinity)).toBe(
      POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND
    );
  });
});

describe("scrollLeftForStableAnchor", () => {
  it("keeps the anchor time under the same on-screen x after a zoom change", () => {
    // At 50px/s, 4s sits at x=200. Anchored at client x=120, the container
    // must have been scrolled 80px for that to be true.
    const scrollLeft = scrollLeftForStableAnchor({
      anchorSeconds: 4,
      anchorClientXPx: 120,
      newPixelsPerSecond: 50,
    });
    expect(scrollLeft).toBe(80);
  });

  it("never returns a negative scroll position", () => {
    const scrollLeft = scrollLeftForStableAnchor({
      anchorSeconds: 1,
      anchorClientXPx: 500,
      newPixelsPerSecond: 10,
    });
    expect(scrollLeft).toBe(0);
  });
});

describe("snapToTargets", () => {
  const targets = [0, 5, 12];
  const pps = 100; // 8px threshold => 0.08s

  it("snaps to the nearest target within the pixel threshold", () => {
    const result = snapToTargets(5.05, targets, pps);
    expect(result.snappedToSeconds).toBe(5);
    expect(result.seconds).toBe(5);
  });

  it("picks the closer of two targets within range rather than the first", () => {
    // Exactly between two targets 0.5s apart at 100px/s would be out of an
    // 8px range for both, so use targets close enough that both qualify.
    const closeTargets = [10, 10.03, 10.09];
    const result = snapToTargets(10.05, closeTargets, pps);
    expect(result.snappedToSeconds).toBe(10.03);
  });

  it("does not snap when nothing is within the threshold", () => {
    const result = snapToTargets(6, targets, pps);
    expect(result.snappedToSeconds).toBeNull();
    expect(result.seconds).toBe(6);
  });

  it("respects a caller-supplied threshold", () => {
    const result = snapToTargets(5.5, targets, pps, 60); // 60px => 0.6s
    expect(result.snappedToSeconds).toBe(5);
  });
});

describe("mainTrackDropIndex", () => {
  const items = [
    { start: 0, duration: 4 }, // midpoint 2
    { start: 4, duration: 6 }, // midpoint 7
    { start: 10, duration: 2 }, // midpoint 11
  ];

  it("returns 0 before the first clip's midpoint", () => {
    expect(mainTrackDropIndex(-1, items)).toBe(0);
    expect(mainTrackDropIndex(1.9, items)).toBe(0);
  });

  it("returns the index between two clips once past a midpoint", () => {
    expect(mainTrackDropIndex(2.1, items)).toBe(1);
    expect(mainTrackDropIndex(7.1, items)).toBe(2);
  });

  it("returns items.length past the last clip's midpoint", () => {
    expect(mainTrackDropIndex(11.1, items)).toBe(3);
  });

  it("returns 0 for an empty main track", () => {
    expect(mainTrackDropIndex(5, [])).toBe(0);
  });
});

describe("overlayRowAtPointerY", () => {
  const layout = {
    overlayTrackCount: 2, // tracks 1 (bottom overlay) and 2 (top overlay)
    overlayRowHeightPx: 40,
    mainRowHeightPx: 64,
  };

  it("maps the topmost row to the highest track index", () => {
    expect(overlayRowAtPointerY(10, layout)).toEqual({
      kind: "overlay",
      trackIndex: 2,
    });
  });

  it("maps the row below it to the next track index down", () => {
    expect(overlayRowAtPointerY(50, layout)).toEqual({
      kind: "overlay",
      trackIndex: 1,
    });
  });

  it("maps anything at or past the overlay rows to the main row", () => {
    expect(overlayRowAtPointerY(80, layout)).toEqual({ kind: "main" });
    expect(overlayRowAtPointerY(500, layout)).toEqual({ kind: "main" });
  });

  it("treats a pointer above the stack as a request for a new layer", () => {
    expect(overlayRowAtPointerY(-5, layout)).toEqual({
      kind: "new-layer",
      trackIndex: 3,
    });
  });

  it("treats a project with no overlay tracks yet as all main, above which is a new layer", () => {
    const noOverlays = {
      overlayTrackCount: 0,
      overlayRowHeightPx: 40,
      mainRowHeightPx: 64,
    };
    expect(overlayRowAtPointerY(10, noOverlays)).toEqual({ kind: "main" });
    expect(overlayRowAtPointerY(-1, noOverlays)).toEqual({
      kind: "new-layer",
      trackIndex: 1,
    });
  });
});

describe("rowsYWithoutKeyLanes", () => {
  const layout = { overlayTrackCount: 2, overlayRowHeightPx: 52, mainRowHeightPx: 72 };
  // Keyframe rows under the top overlay row (track 2): rows 52 to 140.
  const lanes = { topPx: 52, heightPx: 88 };

  it("leaves a y above the keyframe rows alone", () => {
    expect(rowsYWithoutKeyLanes(10, lanes)).toBe(10);
    expect(rowsYWithoutKeyLanes(-1, lanes)).toBe(-1);
    expect(rowsYWithoutKeyLanes(60, null)).toBe(60);
  });

  it("reads a y over the keyframe rows as the clip's own row", () => {
    const y = rowsYWithoutKeyLanes(100, lanes);
    expect(overlayRowAtPointerY(y, layout)).toEqual({ kind: "overlay", trackIndex: 2 });
  });

  it("shifts a y below the keyframe rows up by their height", () => {
    expect(rowsYWithoutKeyLanes(150, lanes)).toBe(62);
    expect(overlayRowAtPointerY(rowsYWithoutKeyLanes(150, lanes), layout)).toEqual({
      kind: "overlay",
      trackIndex: 1,
    });
    expect(overlayRowAtPointerY(rowsYWithoutKeyLanes(200, lanes), layout)).toEqual({
      kind: "main",
    });
  });
});

describe("autoScrollForPlayhead", () => {
  it("leaves the scroll position alone while the playhead is comfortably in view", () => {
    const result = autoScrollForPlayhead({
      playheadSeconds: 5,
      pixelsPerSecond: 100, // playhead at x=500
      scrollLeftPx: 0,
      viewportWidthPx: 1000, // 90% line is at x=900
    });
    expect(result).toBeNull();
  });

  it("scrolls so the playhead settles at 25% once it passes the 90% line", () => {
    const result = autoScrollForPlayhead({
      playheadSeconds: 10,
      pixelsPerSecond: 100, // playhead at x=1000
      scrollLeftPx: 0,
      viewportWidthPx: 1000, // 90% line at x=900 - playhead is past it
    });
    // New scrollLeft so playhead (x=1000) sits at 25% of the viewport (250px).
    expect(result).toBe(750);
  });

  it("never scrolls negative", () => {
    const result = autoScrollForPlayhead({
      playheadSeconds: 0.1,
      pixelsPerSecond: 100,
      scrollLeftPx: 0,
      viewportWidthPx: 1, // absurdly narrow, forces the 90% check to trip
    });
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
  });

  it("returns null for a zero-width viewport instead of dividing by it", () => {
    const result = autoScrollForPlayhead({
      playheadSeconds: 5,
      pixelsPerSecond: 100,
      scrollLeftPx: 0,
      viewportWidthPx: 0,
    });
    expect(result).toBeNull();
  });
});

describe("rulerTickInterval", () => {
  // TimeRuler labels every fifth tick.
  const labelSpacingPx = (pixelsPerSecond: number) =>
    rulerTickInterval(pixelsPerSecond) * 5 * pixelsPerSecond;

  it("labels every 5 s around the default zoom and a fitted minute-long post", () => {
    expect(rulerTickInterval(60)).toBe(1);
    expect(rulerTickInterval(42.7)).toBe(1);
  });

  it("labels every half second when zoomed far in", () => {
    expect(rulerTickInterval(400)).toBe(0.1);
  });

  it("labels every second or every 10 s in between", () => {
    expect(rulerTickInterval(100)).toBe(0.2);
    expect(rulerTickInterval(8)).toBe(2);
  });

  it("keeps labels at least 80 px apart across the whole zoom range", () => {
    for (let pixelsPerSecond = 8; pixelsPerSecond <= 400; pixelsPerSecond += 0.5) {
      expect(labelSpacingPx(pixelsPerSecond)).toBeGreaterThanOrEqual(80);
    }
  });

  it("falls back to a label a minute below the zoom range", () => {
    expect(rulerTickInterval(1)).toBe(12);
  });
});

describe("revealPlayheadScrollLeft", () => {
  const at = (playheadSeconds: number, scrollLeftPx: number) =>
    revealPlayheadScrollLeft({
      playheadSeconds,
      pixelsPerSecond: 100,
      scrollLeftPx,
      viewportWidthPx: 1000,
    });

  it("leaves a playhead that is already in view alone", () => {
    expect(at(5, 0)).toBeNull();
    expect(at(12, 500)).toBeNull();
  });

  it("brings a playhead past the right edge a quarter of the way in", () => {
    expect(at(27.5, 0)).toBe(2500);
  });

  it("brings a playhead left of the view back too, never scrolling below 0", () => {
    expect(at(10, 2000)).toBe(750);
    expect(at(1, 2000)).toBe(0);
  });

  it("returns null for a zero-width viewport", () => {
    expect(
      revealPlayheadScrollLeft({
        playheadSeconds: 5,
        pixelsPerSecond: 100,
        scrollLeftPx: 0,
        viewportWidthPx: 0,
      })
    ).toBeNull();
  });
});

describe("placeDraggedOverlay", () => {
  // 100 px/s with the default 8 px threshold snaps within 0.08 s.
  it("keeps the start where the drag put it when nothing is near", () => {
    expect(placeDraggedOverlay(3, 2, [0, 10], 100)).toEqual({
      start: 3,
      guideSeconds: null,
    });
  });

  it("snaps the start to a nearby target", () => {
    expect(placeDraggedOverlay(10.05, 2, [0, 10], 100)).toEqual({
      start: 10,
      guideSeconds: 10,
    });
  });

  it("snaps the end instead when the end is the closer one", () => {
    // The end lands at 9.97, 0.03 s from 10. The start is 0.07 s from 8.04.
    expect(placeDraggedOverlay(7.97, 2, [8.04, 10], 100)).toEqual({
      start: 8,
      guideSeconds: 10,
    });
  });

  it("lands exactly on a target between frames instead of the nearest frame", () => {
    // Half of a 22.635 s recording is 11.3175 s, which isn't on a 30 fps frame.
    expect(placeDraggedOverlay(11.35, 11.3175, [11.3175], 100).start).toBe(11.3175);
    expect(placeDraggedOverlay(11.3, 11.3175, [22.635], 100).start).toBe(11.3175);
  });

  it("rounds a start that snaps to nothing to a frame", () => {
    expect(placeDraggedOverlay(3.01, 2, [], 100).start).toBeCloseTo(3, 10);
  });

  it("never lands before 0", () => {
    expect(placeDraggedOverlay(-3, 2, [], 100).start).toBe(0);
  });
});
