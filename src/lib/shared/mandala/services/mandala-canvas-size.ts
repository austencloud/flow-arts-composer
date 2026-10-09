/**
 * On-screen size tracking for the live mandala canvas.
 *
 * The canvas backing store follows the canvas's on-screen CSS size. Measuring
 * it every frame was expensive: each backing-store resize invalidates layout,
 * so the next frame's measure forced a fresh layout (~5 ms a frame through an
 * Undo morph). The bounding box also grew with the container's spin, so a
 * spinning mandala resized its canvas every frame. This tracker measures on
 * the first draw, after a layout resize (`invalidate`), and every
 * `recheckDraws` draws, and ignores changes within `tolerance`.
 */

/**
 * Side of a square whose rotated bounding box is `boxWidth` wide. A square
 * rotated by θ has a box side × (|cos θ| + |sin θ|) wide.
 */
export function unrotatedSquareSide(
  boxWidth: number,
  rotationDeg: number
): number {
  const theta = (rotationDeg * Math.PI) / 180;
  return boxWidth / (Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta)));
}

export interface MandalaCanvasSizeTracker {
  /** CSS size to render at; `measure` runs only when a re-measure is due. */
  resolve(measure: () => number, fallback: number): number;
  /** Forget the measurement, e.g. after a layout resize. */
  invalidate(): void;
  readonly measured: number | null;
}

export function createMandalaCanvasSizeTracker({
  recheckDraws = 30,
  tolerance = 0.1,
}: {
  recheckDraws?: number;
  tolerance?: number;
} = {}): MandalaCanvasSizeTracker {
  let measured: number | null = null;
  let drawsSinceMeasure = 0;

  return {
    resolve(measure, fallback) {
      if (measured === null || drawsSinceMeasure >= recheckDraws) {
        const next = Math.round(measure());
        drawsSinceMeasure = 0;
        // Brief scale animations (cascade, hover, FLIP) stay within tolerance;
        // keep the backing store through them instead of reallocating it.
        if (
          next > 0 &&
          (measured === null ||
            Math.abs(next - measured) > measured * tolerance)
        ) {
          measured = next;
        }
      }
      drawsSinceMeasure++;
      // Falls back to the prop while the canvas has no box yet.
      return Math.max(1, measured ?? fallback);
    },
    invalidate() {
      measured = null;
    },
    get measured() {
      return measured;
    },
  };
}
