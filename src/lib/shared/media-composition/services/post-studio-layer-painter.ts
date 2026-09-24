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
  /** Continuous position in one pass: 0 is the opening pose, k the landing of move k. */
  sequencePosition?: number;
  /** The beat the notation highlights: the pose most recently landed. */
  displayedBeatNumber?: number;
  /** 0→1 across the clip's span in the post. */
  projectProgress: number;
  sourceTimeSeconds: number;
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
