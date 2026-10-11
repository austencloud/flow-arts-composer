import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { isSeamlesslyLoopable } from "#lib/shared/foundation/services/sequence-loopability-checker.js";
import {
  isVisibleMotion,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { Plane } from "@austencloud/scene-3d";
import { gridLocationToPosition3D } from "./plane-coordinate-mapper";

function boundaryMatchesInWorld(
  first: MotionData | undefined,
  last: MotionData | undefined
): boolean {
  const hasFirst = isVisibleMotion(first);
  const hasLast = isVisibleMotion(last);
  if (hasFirst !== hasLast) return false;
  if (!hasFirst || !hasLast) return true;

  const start = gridLocationToPosition3D(
    first.plane ?? Plane.WALL,
    first.startLocation,
    1
  );
  const end = gridLocationToPosition3D(
    last.plane ?? Plane.WALL,
    last.endLocation,
    1
  );
  return start.distanceToSquared(end) < 1e-12;
}

/**
 * Plane-aware extension of the canonical loopability check. Most sequences
 * use the fast 2D contract. Multi-plane sequences may express one world point
 * with different local compass labels at the loop seam, so those four boundary
 * motions are compared in world space instead.
 */
export function isSeamlesslyLoopable3D(sequence: SequenceData): boolean {
  if (isSeamlesslyLoopable(sequence)) return true;
  const first = sequence.steps[0];
  const last = sequence.steps.at(-1);
  if (!first || !last) return false;

  const firstLeft = first.motions?.left;
  const firstRight = first.motions?.right;
  const lastLeft = last.motions?.left;
  const lastRight = last.motions?.right;
  const hasAuthoredPlane = [firstLeft, firstRight, lastLeft, lastRight].some(
    (motion) => motion?.plane !== undefined
  );
  if (!hasAuthoredPlane) return false;

  if (
    !boundaryMatchesInWorld(firstLeft, lastLeft) ||
    !boundaryMatchesInWorld(firstRight, lastRight)
  ) {
    return false;
  }

  if (
    isVisibleMotion(firstLeft) &&
    isVisibleMotion(lastLeft) &&
    firstLeft.startOrientation !== lastLeft.endOrientation
  ) {
    return false;
  }
  if (
    isVisibleMotion(firstRight) &&
    isVisibleMotion(lastRight) &&
    firstRight.startOrientation !== lastRight.endOrientation
  ) {
    return false;
  }
  return true;
}
