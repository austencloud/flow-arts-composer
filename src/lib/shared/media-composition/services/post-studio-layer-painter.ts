import type { SequenceFrame } from "$lib/shared/media-composition/domain/sequence-frame";
import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";

/**
 * A painted layer is a source that is a pure function of the evaluated frame:
 * the beat carousel today, captions and counters later. Preview and export
 * call the same painter, so the export draws at output resolution instead of
 * sampling whatever size the preview canvas happened to be.
 */
export interface PaintRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The slice of an evaluated frame layer a painter may read. */
export interface PaintFrame {
  /**
   * Engine convention, folded into one pass: [0, 1) holds the start
   * placement, [k, k + 1) is move k in flight, and N + 1 is the last landing.
   */
  sequencePosition?: number;
  /** Position measured at beat landings; 0 is the opening pose. */
  carouselPosition?: number;
  /** The beat the card highlights: the pose most recently landed. */
  displayedBeatNumber?: number;
  /** 0→1 across the clip's span in the post. */
  projectProgress: number;
  sourceTimeSeconds: number;
  /** Which move is showing. Absent on a layer no take's timing reaches. */
  sequenceFrame?: SequenceFrame;
  /** The post's own clock, for overlays timed against the whole post. */
  projectTimeSeconds?: number;
  /** The layer's framing right now, for a painter that places points itself. */
  transform?: EvaluatedFrameLayer["transform"];
  /** The footage's manually placed box and source crop at this frame. */
  sourceGeometry?: EvaluatedFrameLayer["sourceGeometry"];
}

/** The painter's view of one evaluated layer at one post time. */
export function toPaintFrame(
  layer: EvaluatedFrameLayer,
  projectTimeSeconds?: number
): PaintFrame {
  return {
    sequencePosition: layer.sequencePosition,
    carouselPosition: layer.carouselPosition,
    displayedBeatNumber: layer.displayedBeatNumber,
    projectProgress: layer.projectProgress,
    sourceTimeSeconds: layer.sourceTimeSeconds,
    sequenceFrame: layer.sequenceFrame,
    projectTimeSeconds,
    transform: layer.transform,
    sourceGeometry: layer.sourceGeometry,
  };
}

const PAINT_SIZE_LADDER_RATIO = 1.06;

/**
 * Rounds a pixel size up to the next rung of a 6% geometric ladder, so a
 * painter's per-size raster cache coalesces the many close-together sizes a
 * smoothly dragged resize (or export at a slightly different resolution)
 * asks for into one shared bucket, instead of re-rendering on every pixel of
 * movement. The result is always at least `px`, so a cached raster keyed by
 * the bucket is never smaller than what was actually asked for.
 */
export function paintSizeBucket(px: number): number {
  const size = Math.max(1, px);
  const step = Math.ceil(
    Math.log(size) / Math.log(PAINT_SIZE_LADDER_RATIO) - 1e-9
  );
  const rung = Math.ceil(Math.pow(PAINT_SIZE_LADDER_RATIO, step));
  return Math.max(Math.ceil(size), rung);
}

/**
 * The cached size closest to `target` among `available`, or null when
 * nothing is cached yet. Lets `paint` draw the nearest raster that is
 * actually ready instead of leaving a blank while the exact bucket it just
 * asked `prepare` for is still rendering.
 */
export function nearestCachedSize(
  available: Iterable<number>,
  target: number
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const size of available) {
    const distance = Math.abs(size - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = size;
    }
  }
  return best;
}

export interface PostStudioLayerPainter {
  /**
   * Readies whatever the painter caches for a target of this pixel size.
   * Idempotent per size. `paint` before it resolves draws what it can
   * (typically the background) rather than throwing.
   */
  prepare(target: { width: number; height: number }): Promise<void>;
  /**
   * A painter that frames its own drawing from `PaintFrame.transform`, so the
   * export must not also turn and scale the context. The staff effects move
   * points with the footage's framing but keep sparks and smoke upright.
   */
  readonly ownsTransform?: boolean;
  /** Draws synchronously into `rect` of `context`, in that context's pixels. */
  paint(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    frame: PaintFrame
  ): void;
}
