/**
 * Arrow Collision Resolver
 *
 * When two hands end at the same grid location in a step, their arrows stack
 * on top of each other and become unreadable. This resolver detects those
 * collisions and pushes the arrows apart by applying pixel offsets in the
 * outward direction from the shared endpoint.
 *
 * "Outward" means away from the center of the coordinate space. Blue goes
 * outward, red goes inward by the same amount. The result is two arrows that
 * fan apart symmetrically around the grid point.
 *
 * All offsets are in the 950×950 coordinate space where adjacent cardinal
 * grid points are ~143 units apart.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createArrowPlacementData } from "#lib/shared/pictograph/arrow/positioning/placement/domain/create-arrow-placement-data.js";


// For each grid location, the outward direction vector is the unit vector
// pointing away from the center of the 950×950 coordinate space.
// Magnitude is tuned so arrows are visibly separated without
// overlapping adjacent grid points (~35% of the 143-unit grid spacing).

interface OffsetVector {
  readonly x: number;
  readonly y: number;
}

// Each vector points diagonally outward from center toward the grid location.
// Cardinal points use 45° diagonals so the two arrows fan apart visually
// rather than stacking along a single axis.
const OUTWARD_OFFSETS: Record<GridLocation, OffsetVector> = {
  // Cardinals: diagonal outward (NE/NW for NORTH, etc.)
  // Blue gets the vector, red gets the inverse → they fan apart symmetrically.
  [GridLocation.NORTH]:     { x: +35, y: -35 },
  [GridLocation.EAST]:      { x: +35, y: +35 },
  [GridLocation.SOUTH]:     { x: -35, y: +35 },
  [GridLocation.WEST]:      { x: -35, y: -35 },
  // Intercardinals: already diagonal, push along the radial direction
  [GridLocation.NORTHEAST]: { x: +35, y: -35 },
  [GridLocation.SOUTHEAST]: { x: +35, y: +35 },
  [GridLocation.SOUTHWEST]: { x: -35, y: +35 },
  [GridLocation.NORTHWEST]: { x: -35, y: -35 },
  // CENTER has no meaningful outward direction - no offset applied
  [GridLocation.CENTER]:    { x:   0, y:   0 },
};


/**
 * Returns a new steps array where any step with blue and red arrows ending
 * at the same location has those arrows pushed apart.
 *
 * Non-colliding steps are returned as-is (same object reference). Only
 * colliding steps produce new PictographData instances with updated
 * arrowPlacementData on both motions.
 */
export function resolveCollisions(steps: PictographData[]): PictographData[] {
  return steps.map((step) => resolveStep(step));
}


function resolveStep(step: PictographData): PictographData {
  const left = step.motions[HandSide.LEFT];
  const right = step.motions[HandSide.RIGHT];

  // Nothing to resolve if either motion is missing
  if (!left || !right) return step;

  // No collision if the hands end at different locations
  if (left.endLocation !== right.endLocation) return step;

  const offset = OUTWARD_OFFSETS[left.endLocation];

  // CENTER has zero offset - no useful outward direction, skip it
  if (offset.x === 0 && offset.y === 0) return step;

  return {
    ...step,
    motions: {
      ...step.motions,
      [HandSide.LEFT]: applyOffset(left, +offset.x, +offset.y),
      // Use (0 - n) instead of (-n) to avoid -0 for zero-component axes
      [HandSide.RIGHT]:  applyOffset(right,  0 - offset.x, 0 - offset.y),
    },
  };
}

function applyOffset(
  motion: MotionData,
  dx: number,
  dy: number
): MotionData {
  const updatedPlacement = createArrowPlacementData({
    ...motion.arrowPlacementData,
    manualAdjustmentX: (motion.arrowPlacementData.manualAdjustmentX ?? 0) + dx,
    manualAdjustmentY: (motion.arrowPlacementData.manualAdjustmentY ?? 0) + dy,
  });

  return createMotionData({
    ...motion,
    arrowPlacementData: updatedPlacement,
  });
}
