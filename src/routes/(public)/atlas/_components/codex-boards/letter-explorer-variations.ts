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
      leftTurns,
      rightTurns,
      leftRotation,
      rightRotation
    )
  );
}
