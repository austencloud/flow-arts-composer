import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
import { applyPendingTurnsToOption } from "#lib/shared/create/services/apply-turns-to-motion.js";
import type { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

export function motionAllowsFloat(
  pictograph: PictographData | null,
  hand: HandSide
): boolean {
  const motion = pictograph?.motions?.[hand];
  return (
    motion?.motionType !== MotionType.DASH &&
    motion?.motionType !== MotionType.STATIC
  );
}

/** Float is a pro or anti turn; a dash or static hand set to float stays at
 *  zero turns, since one board-wide setting reaches every kind of letter. */
function allowedTurns(
  pictograph: PictographData,
  hand: HandSide,
  turns: TurnValue
): TurnValue {
  return turns === "fl" && !motionAllowsFloat(pictograph, hand) ? 0 : turns;
}

export function applyTurnsToVariations(
  variations: readonly PictographData[],
  leftTurns: TurnValue,
  rightTurns: TurnValue,
  leftRotation: RotationDirection,
  rightRotation: RotationDirection
): PictographData[] {
  return variations.map((variation) =>
    applyPendingTurnsToOption(
      variation,
      allowedTurns(variation, HandSide.LEFT, leftTurns),
      allowedTurns(variation, HandSide.RIGHT, rightTurns),
      leftRotation,
      rightRotation
    )
  );
}

function sameEnds(a: PictographData, b: PictographData, hand: HandSide): boolean {
  const left = a.motions?.[hand];
  const right = b.motions?.[hand];
  return (
    left?.startLocation === right?.startLocation &&
    left?.endLocation === right?.endLocation &&
    left?.motionType === right?.motionType
  );
}

/**
 * The variation that draws the same motion as `target` - each hand starting
 * and ending in the same place with the same motion type. A board cell may be
 * rotated, mirrored or hand-swapped, so its index in the explorer is found by
 * what it draws, not by where it came from. -1 when none matches.
 */
export function findMatchingVariation(
  variations: readonly PictographData[],
  target: PictographData
): number {
  return variations.findIndex(
    (variation) =>
      sameEnds(variation, target, HandSide.LEFT) &&
      sameEnds(variation, target, HandSide.RIGHT)
  );
}
