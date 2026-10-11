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
import { getGravityOrientation } from "./poi-gravity-orientation-deriver";
import { PoiMotionValidity } from "../domain/poi-enums";
import type { PoiValidationResult, PoiConstraintViolation } from "../domain/poi-models";

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

export function validateTransition(
  fromMotion: MotionData,
  toMotion: MotionData
): PoiValidationResult {
  const violations: PoiConstraintViolation[] = [];

  // Constraint: Cannot instantly reverse spin direction (needs stall/transition)
  const fromHasRotation =
    fromMotion.rotationDirection !== RotationDirection.NO_ROTATION;
  const toHasRotation =
    toMotion.rotationDirection !== RotationDirection.NO_ROTATION;

  if (
    fromHasRotation &&
    toHasRotation &&
    fromMotion.rotationDirection !== toMotion.rotationDirection
  ) {
    violations.push({
      violation: PoiMotionValidity.INVALID_SPIN_REVERSAL,
      message:
        "Cannot instantly reverse spin direction (CW↔CCW) - needs stall or transition beat",
      motionHand: toMotion.hand,
    });
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
