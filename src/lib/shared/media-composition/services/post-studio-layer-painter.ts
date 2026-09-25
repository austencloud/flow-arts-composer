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
  };
}

export interface PostStudioLayerPainter {
  /**
   * Readies whatever the painter caches for a target of this pixel size.
   * Idempotent per size. `paint` before it resolves draws what it can
   * (typically the background) rather than throwing.
   */
  prepare(target: { width: number; height: number }): Promise<void>;
  /** Draws synchronously into `rect` of `context`, in that context's pixels. */
  paint(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    frame: PaintFrame
  ): void;
}
