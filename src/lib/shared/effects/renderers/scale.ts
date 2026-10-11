import { DEFAULT_CANVAS_SIZE } from "#lib/shared/animation-engine/services/canvas-resizer.svelte.js";

/**
 * Compute the scale factor applied to pixel-space quantities in 2D effect
 * renderers. Returns the ratio of the canvas's smaller dimension against
 * the reference size (DEFAULT_CANVAS_SIZE = 500). All renderer constants
 * are authored at reference size; multiplying by this factor keeps them
 * proportionally sized on any canvas.
 *
 * `min()` is used so a narrow viewport (e.g. iPhone portrait) scales by
 * its constrained dimension - the one that actually limits visual real
 * estate - rather than the longer dimension.
 *
 * Matches the existing sizeScale computation in Canvas2DTrailRenderer so
 * trails and the particle-based effects share one baseline.
 */
export function computeEffectScale(width: number, height: number): number {
  const minDim = Math.min(width, height);
  if (minDim <= 0) return 0;
  return minDim / DEFAULT_CANVAS_SIZE;
}
