/**
 * Directional Tuple Processor
 *
 * Handles complex directional tuple processing for arrow positioning adjustments.
 * Direct TypeScript port of the Python DirectionalTupleProcessor.
 *
 * This service handles:
 * - Directional tuple generation based on motion data
 * - Complex adjustment processing for different motion types
 *
 * Note: Uses ArrowQuadrantCalculator for quadrant index calculations to avoid duplication.
 */

import type { MotionData } from "../../../../shared/domain/models/motion-data";
import { GridLocation } from "../../../../grid/domain/enums/grid-enums";
import { Point } from "fabric";
export class DirectionalTupleCalculator {
  /**
   * Calculator for directional tuples used in arrow positioning.
   */

  calculateDirectionalTuple(
    _motion: MotionData,
    _location: GridLocation
  ): [number, number] {
    /**
     * Legacy parity: Additional directional tuple is not separately added.
     * The selection is made directly from the generated 4-tuples.
     */
    return [0, 0];
  }

  generateDirectionalTuples(
    motion: MotionData,
    baseX: number,
    baseY: number
  ): Array<[number, number]> {
    /**
     * Generate directional tuples using legacy mappings by motion type, rotation, and inferred grid.
     * Tuple order: indices 0..3 correspond to NE, SE, SW, NW quadrant mapping.
     */

    const mt = String(motion.motionType).toLowerCase();
    const rot = String(motion.rotationDirection).toLowerCase();

    const NE = GridLocation.NORTHEAST;
    const SE = GridLocation.SOUTHEAST;
    const SW = GridLocation.SOUTHWEST;
    const NW = GridLocation.NORTHWEST;
    const N = GridLocation.NORTH;
    const E = GridLocation.EAST;
    const S = GridLocation.SOUTH;
    const W = GridLocation.WEST;

    // Infer grid mode from motion locations (NOT arrow locations)
    // Diamond mode: motion uses cardinals (N, E, S, W) → arrows placed at diagonals
    // Box mode: motion uses diagonals (NE, SE, SW, NW) → arrows placed at cardinals
    const cardinalSet = new Set<GridLocation>([N, E, S, W]);
    const gridIsDiamond =
      cardinalSet.has(motion.startLocation) ||
      cardinalSet.has(motion.endLocation);

    // Helper to normalize rotation keys
    const isCW = rot === "clockwise" || rot === "cw";
    const isCCW = rot === "counter_clockwise" || rot === "ccw";
    const isNoRot = rot === "norotation";

    // Mapping builders
    const tuple = (a: number, b: number) => [a, b] as [number, number];

    // SHIFT (pro/anti/float)
    const shiftDiamond = () => {
      if (mt === "float") {
        // Hand path decides the mapping. Diamond motions travel the
        // cardinal points, so the step is read around N, E, S, W.
        const order: GridLocation[] = [N, E, S, W];
        const idxStart = order.indexOf(motion.startLocation as GridLocation);
        const idxEnd = order.indexOf(motion.endLocation as GridLocation);
        // Determine cw vs ccw step (1 step cw => cw; else ccw)
        const cwStep = (idxStart + 1) % 4 === idxEnd;
        if (cwStep) {
          return [
            tuple(baseX, baseY),
            tuple(-baseY, baseX),
            tuple(-baseX, -baseY),
            tuple(baseY, -baseX),
          ];
        } else {
          return [
            tuple(-baseY, -baseX),
            tuple(baseX, -baseY),
            tuple(baseY, baseX),
            tuple(-baseX, baseY),
          ];
        }
      }
      if (mt === "pro" && isCW)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      if (mt === "pro" && isCCW)
        return [
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
        ];
      if (mt === "anti" && isCW)
        return [
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
        ];
      if (mt === "anti" && isCCW)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      return [
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
      ];
    };

    const shiftBox = () => {
      if (mt === "float") {
        // Box motions travel the diagonal points: NE, SE, SW, NW.
        const order: GridLocation[] = [NE, SE, SW, NW];
        const idxStart = order.indexOf(motion.startLocation as GridLocation);
        const idxEnd = order.indexOf(motion.endLocation as GridLocation);
        const cwStep = (idxStart + 1) % 4 === idxEnd;
        if (cwStep) {
          return [
            tuple(baseX, baseY),
            tuple(-baseY, baseX),
            tuple(-baseX, -baseY),
            tuple(baseY, -baseX),
          ];
        } else {
          return [
            tuple(-baseY, -baseX),
            tuple(baseX, -baseY),
            tuple(baseY, baseX),
            tuple(-baseX, baseY),
          ];
        }
      }
      if (mt === "pro" && isCW)
        return [
          tuple(-baseX, baseY),
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
        ];
      if (mt === "pro" && isCCW)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      if (mt === "anti" && isCW)
        return [
          tuple(-baseX, baseY),
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
        ];
      if (mt === "anti" && isCCW)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      return [
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
      ];
    };

    // DASH
    const dashDiamond = () => {
      if (isCW)
        return [
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
          tuple(-baseY, -baseX),
        ];
      if (isCCW)
        return [
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
        ];
      if (isNoRot)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
        ];
      return [
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
      ];
    };

    const dashBox = () => {
      if (isCW)
        return [
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
          tuple(baseX, baseY),
        ];
      if (isCCW)
        return [
          tuple(-baseX, baseY),
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
        ];
      if (isNoRot)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      return [
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
        tuple(baseX, baseY),
      ];
    };

    // STATIC
    const staticDiamond = () => {
      if (isCW)
        return [
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
          tuple(-baseY, -baseX),
        ];
      if (isCCW)
        return [
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
        ];
      return [
        tuple(baseX, baseY),
        tuple(-baseX, -baseY),
        tuple(-baseY, baseX),
        tuple(baseY, -baseX),
      ];
    };

    const staticBox = () => {
      if (isCW)
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      if (isCCW)
        return [
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
        ];
      return [
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
      ];
    };

    // Dispatch by motion type and grid
    if (mt === "dash") {
      return gridIsDiamond ? dashDiamond() : dashBox();
    } else if (mt === "static") {
      return gridIsDiamond ? staticDiamond() : staticBox();
    } else {
      // pro/anti/float
      return gridIsDiamond ? shiftDiamond() : shiftBox();
    }
  }
}

export class QuadrantIndexCalculator {
  /**
   * Wrapper around ArrowQuadrantCalculator to maintain interface compatibility.
   * Delegates to the centralized quadrant calculation logic.
   */
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private quadrantCalculator: any
  ) {}

  calculateQuadrantIndex(motion: MotionData, location: GridLocation): number {
    return this.quadrantCalculator.calculateQuadrantIndex(motion, location);
  }
}

export class DirectionalTupleProcessor {
  /**
   * Processor for applying directional tuple adjustments to arrow positioning.
   */

  constructor(
    private DirectionalTupleGenerator: DirectionalTupleCalculator,
    private quadrantIndexService: QuadrantIndexCalculator
  ) {}

  processDirectionalTuples(
    baseAdjustment: Point,
    motion: MotionData,
    location: GridLocation
  ): Point {
    /**
     * Process directional tuples to calculate final adjustment.
     *
     * Args:
     *     baseAdjustment: Base adjustment from placement services
     *     motion: Motion data for directional calculations
     *     location: Arrow location for quadrant selection
     *
     * Returns:
     *     Final adjustment point after directional processing
     */
    try {
      // Generate directional tuples from base adjustment
      const directionalTuples =
        this.DirectionalTupleGenerator.generateDirectionalTuples(
          motion,
          baseAdjustment.x,
          baseAdjustment.y
        );

      // Calculate quadrant index for tuple selection
      const quadrantIndex = this.quadrantIndexService.calculateQuadrantIndex(
        motion,
        location
      );

      // Select the appropriate tuple based on quadrant (legacy parity)
      const selectedTuple = directionalTuples[quadrantIndex] || [0, 0];

      // TEMP DIAGNOSTIC — universal chokepoint. EVERY arrow render path funnels
      // through here (solo, non-solo, diagnostics). Set `window.__DBG_ARROW = true`
      // then nudge an arrow. If this prints on nudge, the live preview uses the
      // positioning pipeline (tuple applied → arrows mirror). If it prints
      // NOTHING on nudge, the preview moves arrows outside the pipeline (raw
      // delta → uniform movement). Remove once resolved.
      if (
        typeof globalThis !== "undefined" &&
        (globalThis as { __DBG_ARROW?: boolean }).__DBG_ARROW
      ) {
        console.log(
          `[TUPLE] ${motion.hand} mt=${String(motion.motionType).toLowerCase()}` +
            ` rot=${String(motion.rotationDirection).toLowerCase()} loc=${location} qi=${quadrantIndex}` +
            ` | base=(${baseAdjustment.x},${baseAdjustment.y})` +
            ` → out=(${selectedTuple[0]},${selectedTuple[1]})`,
        );
      }

      // Final adjustment = selected tuple only (baseAdjustment already used to build tuples)
      return new Point(selectedTuple[0], selectedTuple[1]);
    } catch (error) {
      console.warn(
        "Directional tuple processing failed, using base adjustment:",
        error
      );
      return baseAdjustment;
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORTS
// ============================================================================
// Direct singleton exports - no DI container needed.
// ============================================================================

import { calculateQuadrantIndex } from "../../../orchestration/services/arrow-quadrant-calculator";

export const directionalTupleCalculator = new DirectionalTupleCalculator();
export const quadrantIndexCalculator = new QuadrantIndexCalculator({ calculateQuadrantIndex });
export const directionalTupleProcessor = new DirectionalTupleProcessor(
  directionalTupleCalculator,
  quadrantIndexCalculator
);
