/**
 * Turn Manager — turn values and rotation directions for dash/static motions.
 */

import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropContinuity } from "../domain/models/generate-models";

// This module mutates generator-owned draft steps in place (legacy port
// contract: void functions, callers rely on mutation). StepMotions is
// readonly for everyone else; the drafts here are freshly built copies.
type MutableStepMotions = { left: MotionData; right: MotionData };
const mutableMotions = (step: StepData): MutableStepMotions =>
  step.motions as MutableStepMotions;

const ROTATION_DIRS = {
  CLOCKWISE: RotationDirection.CLOCKWISE,
  COUNTER_CLOCKWISE: RotationDirection.COUNTER_CLOCKWISE,
  noRotation: RotationDirection.NO_ROTATION,
} as const;

const MOTION_TYPES = {
  PRO: MotionType.PRO,
  ANTI: MotionType.ANTI,
  FLOAT: MotionType.FLOAT,
  DASH: MotionType.DASH,
  STATIC: MotionType.STATIC,
} as const;

/**
 * Set turns — exact port from legacy set_turns().
 */
export function setTurns(
  step: StepData,
  turnLeft: number | "fl",
  turnRight: number | "fl"
): void {
  if (!step) return;
  setTurnForHand(step, HandSide.LEFT, turnLeft);
  setTurnForHand(step, HandSide.RIGHT, turnRight);
}

/**
 * Update dash/static prop rotation directions — exact port from legacy.
 */
export function updateDashStaticRotationDirections(
  step: StepData,
  propContinuity: PropContinuity,
  leftRotationDirection: string,
  rightRotationDirection: string
): void {
  if (!step) return;
  updateRotationForHand(
    step,
    HandSide.LEFT,
    propContinuity,
    leftRotationDirection
  );
  updateRotationForHand(
    step,
    HandSide.RIGHT,
    propContinuity,
    rightRotationDirection
  );
}

export function getRandomRotationDirection(): RotationDirection {
  const options = [ROTATION_DIRS.CLOCKWISE, ROTATION_DIRS.COUNTER_CLOCKWISE];
  return options[Math.floor(Math.random() * options.length)]!;
}

function setTurnForHand(
  step: StepData,
  hand: HandSide,
  turn: number | "fl"
): void {
  const motion = step.motions[hand];
  if (!motion) return;

  if (turn === "fl") {
    if (
      motion.motionType === MotionType.PRO ||
      motion.motionType === MotionType.ANTI
    ) {
      mutableMotions(step)[hand] = {
        ...motion,
        turns: "fl",
        prefloatMotionType: motion.motionType,
        prefloatRotationDirection: motion.rotationDirection,
        motionType: MotionType.FLOAT,
        rotationDirection: RotationDirection.NO_ROTATION,
      };
    } else {
      mutableMotions(step)[hand] = {
        ...motion,
        turns: 0,
      };
    }
  } else {
    mutableMotions(step)[hand] = {
      ...motion,
      turns: turn,
    };
  }
}

function updateRotationForHand(
  step: StepData,
  hand: HandSide,
  propContinuity: PropContinuity,
  rotationDirection: string
): void {
  const motion = step.motions[hand];
  if (!motion) return;

  if (
    motion.motionType !== MOTION_TYPES.DASH &&
    motion.motionType !== MOTION_TYPES.STATIC
  ) {
    return;
  }

  const turns = motion.turns || 0;
  const hasTurns = typeof turns === "number" && turns > 0;

  let newRotationDirection: RotationDirection;

  if (!hasTurns) {
    newRotationDirection = ROTATION_DIRS.noRotation;
  } else if (propContinuity === PropContinuity.CONTINUOUS) {
    const isValidInherit =
      rotationDirection === ROTATION_DIRS.CLOCKWISE ||
      rotationDirection === ROTATION_DIRS.COUNTER_CLOCKWISE;
    newRotationDirection = isValidInherit
      ? (rotationDirection as RotationDirection)
      : getRandomRotationDirection();
  } else {
    newRotationDirection = getRandomRotationDirection();
  }

  mutableMotions(step)[hand] = {
    ...motion,
    rotationDirection: newRotationDirection,
  };
}

/**
 * Drop-in replacement for the old singleton.
 */
export const turnManager = {
  setTurns,
  updateDashStaticRotationDirections,
  getRandomRotationDirection,
};
