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

/**
 * The extra scale a canvas needs while its raster is older than its box.
 *
 * Every layer draws the engine's square centred in its raster, so the right
 * on-screen size of a raster pixel is the box's square over the raster's
 * square. `object-fit: contain` instead fits the raster's whole rectangle,
 * which agrees only while the raster and the box share a shape. A frame-shaped
 * overlay raster left tall by a box that is shrinking in height otherwise
 * draws its square too small, then snaps to full size when the raster is
 * rebuilt. 1 when the raster already matches the box's shape, as a square
 * raster always does.
 */
export function staleRasterScale(
  boxWidth: number,
  boxHeight: number,
  rasterWidth: number,
  rasterHeight: number
): number {
  if (boxWidth <= 0 || boxHeight <= 0 || rasterWidth <= 0 || rasterHeight <= 0)
    return 1;
  const contain = Math.min(boxWidth / rasterWidth, boxHeight / rasterHeight);
  const square =
    Math.min(boxWidth, boxHeight) / Math.min(rasterWidth, rasterHeight);
  return square / contain;
}

/** Where the engine's square sits inside the frame: centred on both axes. */
export function frameOffset(frame: CanvasFrame): { x: number; y: number } {
  return {
    x: (frame.width - frame.size) / 2,
    y: (frame.height - frame.size) / 2,
  };
}
