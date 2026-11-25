/**
 * The grid's first fill: every header and tile draws itself with the engine's
 * own reveal (renderCell's twin), corner outward one diagonal at a time. The
 * reveal's last frame is the tile's picture, so the drawing hands over to the
 * still with nothing to swap.
 */
import { DURATION, STAGGER } from "@austencloud/motion";
import type { MandalaGuideRevealFrame } from "#lib/shared/mandala/services/mandala-guide-image.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";

export const SHAPE_MATRIX_DRAW_IN = {
  /** One tile's stroke, start to finish. */
  tileMs: DURATION.scene,
  /** The wait between one diagonal and the next. */
  diagonalMs: STAGGER.relaxed,
} as const;

/**
 * When the tile at (row, column) starts drawing, with the header row and the
 * header column at index 0. The two headers beside the corner start at once.
 */
export function shapeMatrixDrawInDelay(row: number, column: number): number {
  return Math.max(0, row + column - 1) * SHAPE_MATRIX_DRAW_IN.diagonalMs;
}

/**
 * The most one painted frame moves a fill along. A slow but steady page (ten
 * frames a second) still draws at its own pace; only a stall is not counted.
 */
export const MAX_DRAW_IN_FRAME_MS = 100;

/** One first fill's shared clock, counted in frames that were painted. */
export interface ShapeMatrixDrawInTimeline {
  /** How far the fill has come, in milliseconds. */
  elapsed: () => number;
  /**
   * Calls `onFrame` with `elapsed` on each painted frame, until it returns
   * false. The returned stop ends it early.
   */
  subscribe: (onFrame: (elapsed: number) => boolean) => () => void;
}

/**
 * One first fill's timeline. It starts at zero on the first frame painted
 * after a tile subscribes, and every tile shares it. It counts painted time,
 * not the wall clock: the fill runs while the rest of the page is still
 * starting, and a block of that work (half a second and more on a busy
 * machine) would otherwise use up the drawing without a frame of it showing.
 * A hidden tab paints nothing, so a fill opened there waits to be seen. A tile
 * that mounts after the fill (scrolled into view on a tall grid, or a new
 * level's) finds the timeline already past it.
 */
export function createShapeMatrixDrawInTimeline(
  frames: {
    request: (step: (now: number) => void) => number;
    cancel: (id: number) => void;
  } = {
    request: (step) => requestAnimationFrame(step),
    cancel: (id) => cancelAnimationFrame(id),
  }
): ShapeMatrixDrawInTimeline {
  const drawing = new Set<(elapsed: number) => boolean>();
  let elapsed = 0;
  let lastFrame: number | null = null;
  let pending: number | null = null;

  function rest(): void {
    if (pending !== null) frames.cancel(pending);
    pending = null;
    lastFrame = null;
  }
  function step(now: number): void {
    pending = null;
    if (lastFrame !== null)
      elapsed += Math.min(MAX_DRAW_IN_FRAME_MS, Math.max(0, now - lastFrame));
    lastFrame = now;
    for (const onFrame of [...drawing])
      if (!onFrame(elapsed)) drawing.delete(onFrame);
    if (drawing.size > 0) {
      pending ??= frames.request(step);
      return;
    }
    // Every tile has finished: the first fill is over for good.
    elapsed = Infinity;
    rest();
  }

  return {
    elapsed: () => elapsed,
    subscribe: (onFrame) => {
      drawing.add(onFrame);
      pending ??= frames.request(step);
      return () => {
        drawing.delete(onFrame);
        if (drawing.size === 0) rest();
      };
    },
  };
}

/** What a ShapeMatrixMandalaArt needs to draw its picture on. */
export interface MandalaArtDrawIn {
  /** The reveal twin of the still this art paints, at `sizePx`. */
  frame: (
    canvas: HTMLCanvasElement,
    sizePx: number
  ) => MandalaGuideRevealFrame | null;
  /**
   * Whether the grid is on screen yet. Read reactively: the art waits, blank,
   * until it turns true, and only then joins the timeline.
   */
  shown: () => boolean;
  /** The fill this art belongs to, and its own turn within it. */
  timeline: ShapeMatrixDrawInTimeline;
  delayMs: number;
  durationMs: number;
}

/**
 * The paths a host's own tile painter paints from, with the tip its extent
 * fit uses: what the grid's draw-in reveals for a grid whose tiles are not
 * the flower data's.
 */
export interface ShapeMatrixDrawGeometry<TAxis> {
  header: (
    item: TAxis,
    hand: "left" | "right"
  ) => { paths: MandalaPaths; tipDx: number } | null;
  cell: (
    left: TAxis,
    right: TAxis
  ) => { left: MandalaPaths; right: MandalaPaths; tipDx: number } | null;
}
