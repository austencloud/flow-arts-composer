/**
 * Screen Space Adjustment Transformer
 *
 * Transforms screen-space adjustments (from WASD input) to reference values
 * that produce correct screen-space positions after directional tuple processing.
 *
 * IMPORTANT: NOT all transformation matrices are self-inverse!
 * - Reflections and 180° rotations ARE self-inverse
 * - 90° and 270° rotations are NOT self-inverse (they're inverses of each other)
 *
 * To correctly transform screen-space to reference:
 * 1. User wants screen-space (0, -5) = move up on THEIR screen
 * 2. We apply the INVERSE transform → get reference value
 * 3. Store reference value
 * 4. On render, DirectionalTupleProcessor applies forward transform
 * 5. Result: back to screen-space (0, -5) = arrow moves up ✓
 *
 * The inverse is computed by finding R such that transform(R) = screen_input.
 * For each quadrant's matrix, we compute and apply its mathematical inverse.
 */

import { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";
import type { MotionData } from "../../../../shared/domain/models/motion-data";
import type { GridLocation } from "../../../../grid/domain/enums/grid-enums";
import type { DirectionalTupleCalculator } from "./directional-tuple-processor";
import { calculateQuadrantIndex } from "../../../orchestration/services/arrow-quadrant-calculator";

export class ScreenSpaceAdjustmentTransformer {
  constructor(private tupleCalculator: DirectionalTupleCalculator) {}

  /**
   * Transform screen-space adjustment to reference value using the INVERSE transformation.
   *
   * We need to find the reference value R such that when the forward transform is
   * applied during rendering, it produces the desired screen-space result.
   */
  transformToReference(
    screenSpaceAdjustment: Point,
    motionData: MotionData,
    location: GridLocation
  ): Point {
    try {
      const x = screenSpaceAdjustment.x;
      const y = screenSpaceAdjustment.y;

      // Get quadrant index for this arrow
      const quadrantIndex = calculateQuadrantIndex(motionData, location);

      // Generate the forward transformation tuples to understand the matrix
      // We use (1, 0) and (0, 1) as basis vectors to extract the matrix coefficients
      const basisX = this.tupleCalculator.generateDirectionalTuples(motionData, 1, 0);
      const basisY = this.tupleCalculator.generateDirectionalTuples(motionData, 0, 1);

      // Extract the 2x2 transformation matrix for this quadrant
      // If forward transform is: [a b; c d] * [x; y] = [ax+by; cx+dy]
      // Then: transform(1,0) = [a; c] and transform(0,1) = [b; d]
      const [a, c] = basisX[quadrantIndex] || [1, 0];
      const [b, d] = basisY[quadrantIndex] || [0, 1];

      // Compute the inverse matrix: [a b; c d]^-1 = (1/det) * [d -b; -c a]
      // where det = ad - bc
      const det = a * d - b * c;

      // Tolerance for detecting degenerate (non-invertible) matrices
      const DEGENERATE_TOLERANCE = 0.0001;
      if (Math.abs(det) < DEGENERATE_TOLERANCE) {
        // Degenerate matrix - fall back to identity (no transformation)
        return screenSpaceAdjustment;
      }

      // Apply inverse transformation: [d -b; -c a] / det * [x; y]
      const invX = (d * x - b * y) / det;
      const invY = (-c * x + a * y) / det;

      // TEMP DIAGNOSTIC — set window.__DBG_ARROW = true. Shows the quadrant index
      // + extracted forward matrix [a,b,c,d] this inverse is built from. If this
      // qi/matrix disagrees with the render's [TUPLE] qi, the inverse is inverting
      // the WRONG quadrant → arrow moves the wrong way. Remove once resolved.
      if (typeof globalThis !== "undefined" && (globalThis as { __DBG_ARROW?: boolean }).__DBG_ARROW) {
        console.log(
          `[XFORM] ${String(motionData.hand)} mt=${String(motionData.motionType).toLowerCase()}` +
            ` rot=${String(motionData.rotationDirection).toLowerCase()} loc=${location} qi=${quadrantIndex}` +
            ` fwdMatrix[a,b,c,d]=[${a},${b},${c},${d}] det=${det}` +
            ` in=(${x},${y}) → invRef=(${Math.round(invX)},${Math.round(invY)})`,
        );
      }

      return new Point(Math.round(invX), Math.round(invY));
    } catch {
      // Transform failed - use original input unchanged
      return screenSpaceAdjustment;
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of screenSpaceAdjustmentTransformer to avoid DI container rebuilds.
// ============================================================================

import { directionalTupleCalculator } from "./directional-tuple-processor";

export const screenSpaceAdjustmentTransformer = new ScreenSpaceAdjustmentTransformer(
  directionalTupleCalculator
);
