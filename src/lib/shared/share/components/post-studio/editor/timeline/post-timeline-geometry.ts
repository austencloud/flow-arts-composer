import { POST_FRAME_RATE } from "$lib/shared/media-composition/domain/post-project";

/**
 * All the math PostTimeline needs to turn pixels into post-seconds and back:
 * zoom limits, snapping, where a dragged clip would land, which row a pointer
 * is over, fit-to-width zoom and keeping the playhead in view during
 * playback. Nothing here touches the DOM or a PostProject - the component
 * measures the screen and passes plain numbers in.
 */

/** Zoomed all the way out, a hair under a second still gets a pixel to land on. */
export const POST_TIMELINE_MIN_PIXELS_PER_SECOND = 8;
/** Zoomed all the way in, roughly a frame every 3px at 30fps. */
export const POST_TIMELINE_MAX_PIXELS_PER_SECOND = 400;
/** Used when there is nothing to fit yet (an empty project). */
export const POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND = 60;
/** How close (in px) a drag has to land on a target to snap to it. */
export const POST_TIMELINE_SNAP_THRESHOLD_PX = 8;

export function clampPixelsPerSecond(
  pixelsPerSecond: number,
  fitZoom = POST_TIMELINE_MIN_PIXELS_PER_SECOND
): number {
  if (!Number.isFinite(pixelsPerSecond)) {
    return POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND;
  }
  // A long post can need less than the usual minimum to remain fully visible.
  const minimum =
    Number.isFinite(fitZoom) && fitZoom > 0
      ? Math.min(POST_TIMELINE_MIN_PIXELS_PER_SECOND, fitZoom)
      : POST_TIMELINE_MIN_PIXELS_PER_SECOND;
  return Math.min(
    POST_TIMELINE_MAX_PIXELS_PER_SECOND,
    Math.max(minimum, pixelsPerSecond)
  );
}

export function secondsToPixels(
  seconds: number,
  pixelsPerSecond: number
): number {
  return seconds * pixelsPerSecond;
}

export function pixelsToSeconds(
  pixels: number,
  pixelsPerSecond: number
): number {
  return pixelsPerSecond > 0 ? pixels / pixelsPerSecond : 0;
}

/** Rounds to the export's frame grid, so a drag settles on a whole frame
 *  instead of a value that would only differ from its neighbour sub-pixel. */
export function roundToFrameSeconds(
  seconds: number,
  frameRate: number = POST_FRAME_RATE
): number {
  if (!(frameRate > 0)) return seconds;
  return Math.round(seconds * frameRate) / frameRate;
}

/**
 * The pixel width available to fit a post of `durationSeconds` into
 * `viewportWidthPx`. Falls back to the default zoom for an empty project (no
 * duration to fit). Fitting may zoom out farther than the normal zoom limit.
 */
export function fitPixelsPerSecond(
  durationSeconds: number,
  viewportWidthPx: number
): number {
  if (
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(viewportWidthPx) ||
    !(durationSeconds > 0) ||
    !(viewportWidthPx > 0)
  ) {
    return POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND;
  }
  return Math.min(
    POST_TIMELINE_MAX_PIXELS_PER_SECOND,
    viewportWidthPx / durationSeconds
  );
}

/**
 * Tick spacings the ruler can use. TimeRuler labels every fifth tick, so
 * these keep every label on a whole second (or a half second, where the
 * zoom is close enough for the ruler to show tenths).
 */
const RULER_TICK_INTERVALS = [0.1, 0.2, 1, 2, 6, 12] as const;
/** The closest two ruler labels may sit, in px. */
const RULER_MIN_LABEL_SPACING_PX = 80;

/** The finest tick spacing whose labels stay readable at this zoom. */
export function rulerTickInterval(pixelsPerSecond: number): number {
  for (const interval of RULER_TICK_INTERVALS) {
    if (interval * 5 * pixelsPerSecond >= RULER_MIN_LABEL_SPACING_PX) {
      return interval;
    }
  }
  return RULER_TICK_INTERVALS[RULER_TICK_INTERVALS.length - 1]!;
}

/**
 * The new scroll position that keeps `anchorSeconds` under the same on-screen
 * x (`anchorClientXPx`, measured from the scroll container's left edge) after
 * its pixels-per-second changes - what makes a ctrl/cmd+wheel zoom feel like
 * it is zooming into the point under the cursor instead of the left edge.
 */
export function scrollLeftForStableAnchor(params: {
  anchorSeconds: number;
  anchorClientXPx: number;
  newPixelsPerSecond: number;
}): number {
  const anchorContentXPx = secondsToPixels(
    params.anchorSeconds,
    params.newPixelsPerSecond
  );
  return Math.max(0, anchorContentXPx - params.anchorClientXPx);
}

export interface SnapResult {
  /** The seconds to use: `seconds` unchanged, or a target's exact value. */
  seconds: number;
  /** Which target it snapped to, or null when nothing was within range. */
  snappedToSeconds: number | null;
}

/**
 * Snaps `seconds` to the nearest of `targets` (zero, the playhead, other
 * clip edges - the caller assembles the list) when one is within
 * `thresholdPx` on screen. Ties go to whichever target is closer in time;
 * an empty or all-out-of-range target list returns `seconds` untouched.
 */
export function snapToTargets(
  seconds: number,
  targets: readonly number[],
  pixelsPerSecond: number,
  thresholdPx: number = POST_TIMELINE_SNAP_THRESHOLD_PX
): SnapResult {
  const thresholdSeconds = pixelsToSeconds(thresholdPx, pixelsPerSecond);
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.abs(target - seconds);
    if (distance <= thresholdSeconds && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best === null
    ? { seconds, snappedToSeconds: null }
    : { seconds: best, snappedToSeconds: best };
}

/**
 * Where a dragged overlay lands. `rawStart` keeps the spot it was grabbed at
 * under the pointer. Its start or its end snaps, whichever is closer to a
 * target, and lands exactly on it. A start that snaps to nothing is rounded
 * to a frame. Either way it stays at 0 or later. `guideSeconds` is the
 * target it snapped to, for the guide line.
 */
export function placeDraggedOverlay(
  rawStart: number,
  durationSeconds: number,
  targets: readonly number[],
  pixelsPerSecond: number
): { start: number; guideSeconds: number | null } {
  const rawEnd = rawStart + durationSeconds;
  const byStart = snapToTargets(rawStart, targets, pixelsPerSecond);
  const byEnd = snapToTargets(rawEnd, targets, pixelsPerSecond);
  const startGap =
    byStart.snappedToSeconds === null ? Infinity : Math.abs(byStart.seconds - rawStart);
  const endGap =
    byEnd.snappedToSeconds === null ? Infinity : Math.abs(byEnd.seconds - rawEnd);
  const snapEnd = endGap < startGap;
  const start = snapEnd
    ? byEnd.seconds - durationSeconds
    : byStart.snappedToSeconds !== null
      ? byStart.seconds
      : roundToFrameSeconds(rawStart);
  return {
    start: Math.max(0, start),
    guideSeconds: snapEnd ? byEnd.snappedToSeconds : byStart.snappedToSeconds,
  };
}

/**
 * Where dragged music lands. `anchors` are times measured from the music's
 * start that may snap: its start (0), its end, and bar 1 while the music
 * sounds it. Whichever anchor lands closest to a target moves the music so
 * it sits exactly on it; with none in range the start is rounded to a frame.
 * Either way it stays at 0 or later. `guideSeconds` is the target it snapped
 * to, for the guide line.
 */
export function placeDraggedMusic(
  rawStart: number,
  anchors: readonly number[],
  targets: readonly number[],
  pixelsPerSecond: number
): { start: number; guideSeconds: number | null } {
  let best: { start: number; guide: number; gap: number } | null = null;
  for (const anchor of anchors) {
    const raw = rawStart + anchor;
    const snapped = snapToTargets(raw, targets, pixelsPerSecond);
    if (snapped.snappedToSeconds === null) continue;
    const gap = Math.abs(snapped.seconds - raw);
    if (!best || gap < best.gap)
      best = {
        start: snapped.seconds - anchor,
        guide: snapped.snappedToSeconds,
        gap,
      };
  }
  return best
    ? { start: Math.max(0, best.start), guideSeconds: best.guide }
    : { start: Math.max(0, roundToFrameSeconds(rawStart)), guideSeconds: null };
}

export interface TimeSpan {
  start: number;
  duration: number;
}

/**
 * Where a dragged main-track clip would land among the other main clips (the
 * dragged item excluded), by comparing the pointer's time to each clip's
 * midpoint. The result is an index into the array `items` would become after
 * the move - 0 means "before the first clip", `items.length` means "after
 * the last".
 */
export function mainTrackDropIndex(
  pointerSeconds: number,
  items: readonly TimeSpan[]
): number {
  let index = 0;
  for (const item of items) {
    const midpoint = item.start + item.duration / 2;
    if (pointerSeconds < midpoint) break;
    index += 1;
  }
  return index;
}

export type OverlayRowHit =
  | { kind: "new-layer"; trackIndex: number }
  | { kind: "overlay"; trackIndex: number }
  | { kind: "main" };

export interface OverlayRowLayout {
  /** `project.tracks.length - 1` - every track but the main one. */
  overlayTrackCount: number;
  overlayRowHeightPx: number;
  mainRowHeightPx: number;
}

/**
 * Which row a pointer at `pointerYPx` (measured from the top of the rows
 * stack, which draws the highest-index overlay track first) is over, for
 * positioning an overlay drag's ghost and target track. Overlay rows run top
 * to bottom from the highest track index to the lowest; the main track is
 * the last, taller row. Above every row means "make a new layer", one track
 * index past the last existing track.
 */
export function overlayRowAtPointerY(
  pointerYPx: number,
  layout: OverlayRowLayout
): OverlayRowHit {
  const { overlayTrackCount, overlayRowHeightPx } = layout;

  if (pointerYPx < 0) {
    return { kind: "new-layer", trackIndex: overlayTrackCount + 1 };
  }

  if (overlayTrackCount > 0 && overlayRowHeightPx > 0) {
    const overlaysBottomPx = overlayTrackCount * overlayRowHeightPx;
    if (pointerYPx < overlaysBottomPx) {
      const rowFromTop = Math.floor(pointerYPx / overlayRowHeightPx);
      const clampedRow = Math.min(
        overlayTrackCount - 1,
        Math.max(0, rowFromTop)
      );
      // Row 0 (topmost) is the highest track index; each row down is one
      // track index lower.
      return { kind: "overlay", trackIndex: overlayTrackCount - clampedRow };
    }
  }

  return { kind: "main" };
}

/** Where the selected clip's keyframe rows sit in the rows stack. */
export interface KeyLanesBand {
  topPx: number;
  heightPx: number;
}

/**
 * A pointer's y as the track rows alone would read it, with the selected
 * clip's keyframe rows (drawn under its own row) taken out. Over those rows
 * reads as the clip's row just above them; below them, everything shifts up
 * by their height.
 */
export function rowsYWithoutKeyLanes(
  pointerYPx: number,
  lanes: KeyLanesBand | null
): number {
  if (!lanes || lanes.heightPx <= 0 || pointerYPx < lanes.topPx) return pointerYPx;
  if (pointerYPx < lanes.topPx + lanes.heightPx) return lanes.topPx - 1;
  return pointerYPx - lanes.heightPx;
}

/**
 * The scroll position that brings the playhead back into a comfortable spot
 * once it has drifted past 90% of the visible width, settling it at 25%
 * from the left. Returns null when the playhead is still comfortably in
 * view, so the caller can leave the scroll position alone - including while
 * the user is scrolling it themselves, which this function has no way to
 * know about and so never overrides on its own.
 */
export function autoScrollForPlayhead(params: {
  playheadSeconds: number;
  pixelsPerSecond: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
}): number | null {
  const { pixelsPerSecond, scrollLeftPx, viewportWidthPx } = params;
  if (!(viewportWidthPx > 0)) return null;
  const playheadPx = secondsToPixels(params.playheadSeconds, pixelsPerSecond);
  const relativeXPx = playheadPx - scrollLeftPx;
  if (relativeXPx <= viewportWidthPx * 0.9) return null;
  return Math.max(0, playheadPx - viewportWidthPx * 0.25);
}

/**
 * Where to scroll so a playhead that jumped while paused (a new clip, an undo,
 * a frame step) is back in view, or null when it already is. It lands a
 * quarter of the way in, as it does during playback.
 */
export function revealPlayheadScrollLeft(params: {
  playheadSeconds: number;
  pixelsPerSecond: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
}): number | null {
  const { pixelsPerSecond, scrollLeftPx, viewportWidthPx } = params;
  if (!(viewportWidthPx > 0)) return null;
  const playheadPx = secondsToPixels(params.playheadSeconds, pixelsPerSecond);
  const relativeXPx = playheadPx - scrollLeftPx;
  if (relativeXPx >= 0 && relativeXPx <= viewportWidthPx * 0.9) return null;
  return Math.max(0, playheadPx - viewportWidthPx * 0.25);
}
