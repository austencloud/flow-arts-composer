/**
 * VTG Terminology Mapper
 *
 * Maps TKA pictograph data to VTG (Vulcan Tech Gospel) terminology.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { PoiTimingDirection, PoiPatternRatio } from "../domain/poi-enums";
import type { VTGTerminologyMapping } from "../domain/poi-models";

export function deriveVTGTerminology(pictograph: PictographData): VTGTerminologyMapping | null {
  const left = pictograph.motions?.left;
  const right = pictograph.motions?.right;

  // Need both hands really there to derive VTG terminology (invisible
  // placeholder = hand not really there under the both-required Step shape)
  if (!isVisibleMotion(left) || !isVisibleMotion(right)) {
    return null;
  }

  // Derive timing (Together vs Split)
  // Together = both hands at same location (same phase)
  // Split = hands at opposite locations (180° out of phase)
  const isTogether = left.startLocation === right.startLocation;

  // Derive direction (Same vs Opposite)
  // Compare rotation directions
  const leftDir = left.rotationDirection;
  const rightDir = right.rotationDirection;

  // Both no rotation counts as "same"
  const bothNoRotation =
    leftDir === RotationDirection.NO_ROTATION &&
    rightDir === RotationDirection.NO_ROTATION;
  const isSameDirection = bothNoRotation || leftDir === rightDir;

  // Map to VTG timing/direction
  let vtgTiming: PoiTimingDirection;
  if (isTogether && isSameDirection) {
    vtgTiming = PoiTimingDirection.TOGETHER_SAME;
  } else if (isTogether && !isSameDirection) {
    vtgTiming = PoiTimingDirection.TOGETHER_OPPOSITE;
  } else if (!isTogether && isSameDirection) {
    vtgTiming = PoiTimingDirection.SPLIT_SAME;
  } else {
    vtgTiming = PoiTimingDirection.SPLIT_OPPOSITE;
  }

  // Derive ratio from average turns
  const leftTurns = typeof left.turns === "number" ? left.turns : 1;
  const rightTurns = typeof right.turns === "number" ? right.turns : 1;
  const avgTurns = (leftTurns + rightTurns) / 2;
  const vtgRatio = getPatternRatio(avgTurns) as PoiPatternRatio;

  return {
    tkaMotionType: `${left.motionType}/${right.motionType}`,
    vtgTiming,
    vtgRatio,
  };
}

export function getPatternRatio(turns: number): string {
  if (turns <= 1) return PoiPatternRatio.ONE_TO_ONE;
  if (turns <= 3) return PoiPatternRatio.ONE_TO_THREE;
  return PoiPatternRatio.ONE_TO_FIVE;
}
