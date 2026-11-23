/**
 * Poi Constraint Validator
 *
 * Validates individual motions and transitions against poi physics rules.
 */

import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGravityOrientation } from "./poi-gravity-orientation-deriver";
import { PoiMotionValidity } from "../domain/poi-enums";
import type {
  PoiValidationResult,
  PoiConstraintViolation,
} from "../domain/poi-models";

export function validateMotion(motion: MotionData): PoiValidationResult {
  const violations: PoiConstraintViolation[] = [];

  // Constraint 1: FLOAT only valid at gravity orientation
  if (motion.motionType === MotionType.FLOAT) {
    const gravityOrientation = getGravityOrientation(motion.startLocation);
    if (motion.startOrientation !== gravityOrientation) {
      violations.push({
        violation: PoiMotionValidity.INVALID_FLOAT_ORIENTATION,
        message: `FLOAT at ${motion.startLocation} requires ${gravityOrientation} orientation (gravity), found ${motion.startOrientation}`,
        motionHand: motion.hand,
      });
    }
  }

  // Constraint 2: ANTI 0 turns never allowed (tramel impossible with poi)
  if (motion.motionType === MotionType.ANTI && motion.turns === 0) {
    violations.push({
      violation: PoiMotionValidity.INVALID_ANTI_ZERO_TURNS,
      message:
        "ANTI with 0 turns is physically impossible with poi (no tramel motion)",
      motionHand: motion.hand,
    });
  }

  // Constraint 3: PRO 0 turns + IN orientation not allowed
  // Can't isolate inward-facing poi (gravity would pull it down)
  if (
    motion.motionType === MotionType.PRO &&
    motion.turns === 0 &&
    motion.startOrientation === Orientation.IN
  ) {
    violations.push({
      violation: PoiMotionValidity.INVALID_PRO_ZERO_IN,
      message:
        "PRO with 0 turns and IN orientation is not possible with poi (cannot isolate inward-facing swinging prop)",
      motionHand: motion.hand,
    });
  }

  // Constraint 4: DASH requires minimum 0.5 turns
  // Can't stop momentum on a dime
  if (
    motion.motionType === MotionType.DASH &&
    typeof motion.turns === "number" &&
    motion.turns < 0.5
  ) {
    violations.push({
      violation: PoiMotionValidity.INVALID_DASH_TURNS,
      message: `DASH requires minimum 0.5 turns with poi, found ${motion.turns}`,
      motionHand: motion.hand,
    });
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/** The eight outer grid points in clockwise order. */
const RING: readonly GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
];

/** Where a hand can be for a pendulum turn: the sides, level with the floor. */
const PENDULUM_TURN_POINTS: readonly GridLocation[] = [
  GridLocation.EAST,
  GridLocation.WEST,
];

/**
 * Which way the hand goes round the grid on this beat, or none when it stays
 * put, crosses straight through, or touches the centre.
 */
function handTravel(motion: MotionData): RotationDirection {
  const from = RING.indexOf(motion.startLocation);
  const to = RING.indexOf(motion.endLocation);
  if (from < 0 || to < 0) return RotationDirection.NO_ROTATION;
  const step = (to - from + RING.length) % RING.length;
  if (step === 0 || step === RING.length / 2) {
    return RotationDirection.NO_ROTATION;
  }
  return step < RING.length / 2
    ? RotationDirection.CLOCKWISE
    : RotationDirection.COUNTER_CLOCKWISE;
}

/** True when both beats turn and they turn opposite ways. */
function changes(a: RotationDirection, b: RotationDirection): boolean {
  return (
    a !== RotationDirection.NO_ROTATION &&
    b !== RotationDirection.NO_ROTATION &&
    a !== b
  );
}

export function validateTransition(
  fromMotion: MotionData,
  toMotion: MotionData
): PoiValidationResult {
  const violations: PoiConstraintViolation[] = [];

  // Constraint: a poi turns around only as a pendulum does: level with the
  // floor and pointing out, so the hand is at a side (east or west) on a beat
  // that ends pointing out.
  // Austen, 2026-10-18: a poi may point in partway "as long as the momentum
  // continues in that same path until an out point occurs". His sitting 1
  // verdicts (2026-11-22) narrowed it: only the pendulum and the hand-at-the-
  // side extendulum turned legally; turning out at the top or bottom, out on
  // a diagonal, sideways or pointing in did not. He added that stalls up or to
  // the side are possible with build-up and pull-back, but chose pendulum
  // turns only until the checker can see a hand path build up. So a change of
  // spin direction, or of the way the hand travels, has to fall on a beat
  // that ends pointing out at the east or west point.
  // Gage's CAPs in caps-topic.ts (capPoiProblem) still use the looser
  // out-point rule. Record: E:/tka-poi/days/2026-11-22/sitting-1.md.
  const spinChanges = changes(
    fromMotion.rotationDirection,
    toMotion.rotationDirection
  );
  const travelChanges = changes(handTravel(fromMotion), handTravel(toMotion));

  if (spinChanges || travelChanges) {
    const pointsOut = fromMotion.endOrientation === Orientation.OUT;
    const atSide = PENDULUM_TURN_POINTS.includes(fromMotion.endLocation);
    if (!pointsOut || !atSide) {
      violations.push({
        violation: PoiMotionValidity.INVALID_SPIN_REVERSAL,
        message: pointsOut
          ? `A poi turns around only level with the floor, with the hand at a side; this hand is at ${fromMotion.endLocation}`
          : `A poi turns around only while it points out; this one points ${fromMotion.endOrientation}`,
        motionHand: toMotion.hand,
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
