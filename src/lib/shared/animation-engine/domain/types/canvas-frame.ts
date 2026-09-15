/**
 * The rectangle an animation surface actually occupies, and the square the
 * engine draws in.
 *
 * Everything in the engine (prop placement, tip tracking, trail capture, the
 * grid, exports) works in a square of side `size`. A host may hand the engine
 * a wider or taller wrapper than that; the square sits centred in it, and the
 * effect overlays are the one layer that paints the whole rectangle, so smoke
 * or fire drifting past the square edge is no longer clipped. `frameOffset`
 * is the translation from square coordinates to that rectangle.
 */
export interface CanvasFrame {
  /** Side of the engine's square, `min(width, height)`. */
  size: number;
  width: number;
  height: number;
}

export function squareFrame(size: number): CanvasFrame {
  return { size, width: size, height: size };
}

export function measureFrame(width: number, height: number): CanvasFrame {
  return { size: Math.min(width, height), width, height };
}

export function sameFrame(a: CanvasFrame, b: CanvasFrame): boolean {
  return a.size === b.size && a.width === b.width && a.height === b.height;
}

/** Where the engine's square sits inside the frame: centred on both axes. */
export function frameOffset(frame: CanvasFrame): { x: number; y: number } {
  return {
    x: (frame.width - frame.size) / 2,
    y: (frame.height - frame.size) / 2,
  };
}
