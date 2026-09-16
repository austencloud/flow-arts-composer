/**
 * Runtime type guards for Step and Motion.
 *
 * Plain boolean predicates (no Zod). Validate enum membership and required
 * fields, used when accepting untrusted input (Firestore reads, imported
 * JSON, MCP payloads, etc).
 *
 * These guards are intentionally conservative: they return `false` for any
 * value that deviates from the canonical shape, even if technically
 * coercible. Coercion belongs in the loader, not the guard.
 */

import type { Step, Motion } from "./index.js";
import { MotionType } from "./motion-type.js";
import { RotationDirection } from "./rotation-direction.js";
import { Orientation } from "./orientation.js";
import { GridLocation, GridMode, GridPlacement } from "./grid.js";
import { Plane } from "./plane.js";
import { HandSide } from "./hand-side.js";

const MOTION_TYPE_VALUES = new Set<string>(Object.values(MotionType));
const ROTATION_DIRECTION_VALUES = new Set<string>(
  Object.values(RotationDirection)
);
const ORIENTATION_VALUES = new Set<string>(Object.values(Orientation));
const GRID_LOCATION_VALUES = new Set<string>(Object.values(GridLocation));
const GRID_MODE_VALUES = new Set<string>(Object.values(GridMode));
const GRID_PLACEMENT_VALUES = new Set<string>(Object.values(GridPlacement));
const PLANE_VALUES = new Set<string>(Object.values(Plane));
const HAND_SIDE_VALUES = new Set<string>(Object.values(HandSide));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnumMember(value: unknown, allowed: Set<string>): boolean {
  return typeof value === "string" && allowed.has(value);
}

function isOptionalEnumMember(value: unknown, allowed: Set<string>): boolean {
  return value === undefined || isEnumMember(value, allowed);
}

function isTurns(value: unknown): boolean {
  if (value === "fl") return true;
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * fields matching canonical membership.
 */
export function isMotion(value: unknown): value is Motion {
  if (!isRecord(value)) return false;
  if (!isEnumMember(value.motionType, MOTION_TYPE_VALUES)) return false;
  if (!isEnumMember(value.startLocation, GRID_LOCATION_VALUES)) return false;
  if (!isEnumMember(value.endLocation, GRID_LOCATION_VALUES)) return false;
  if (!isEnumMember(value.rotationDirection, ROTATION_DIRECTION_VALUES))
    return false;
  if (!isEnumMember(value.startOrientation, ORIENTATION_VALUES)) return false;
  if (!isEnumMember(value.endOrientation, ORIENTATION_VALUES)) return false;
  if (!isTurns(value.turns)) return false;
  if (!isOptionalEnumMember(value.plane, PLANE_VALUES)) return false;
  // `hand` is optional on Motion (redundant when keyed under step.motions.left/right).
  if (!isOptionalEnumMember(value.hand, HAND_SIDE_VALUES)) return false;
  if (!isOptionalEnumMember(value.prefloatMotionType, MOTION_TYPE_VALUES))
    return false;
  if (
    !isOptionalEnumMember(
      value.prefloatRotationDirection,
      ROTATION_DIRECTION_VALUES
    )
  )
    return false;
  return true;
}

/**
 * `value.motions.left` and `value.motions.right` via isMotion, including the
 * hand-channel invariant (left.hand === "left", right.hand === "right").
 */
export function isStep(value: unknown): value is Step {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (value.letter !== null) {
    // Letter values are strings; we don't exhaustively enumerate here because
    // compound and custom letters may extend the alphabet downstream. Any
    // non-empty string or null passes.
    if (typeof value.letter !== "string" || value.letter.length === 0)
      return false;
  }
  if (
    value.startPlacement !== null &&
    !isEnumMember(value.startPlacement, GRID_PLACEMENT_VALUES)
  ) {
    return false;
  }
  if (
    value.endPlacement !== null &&
    !isEnumMember(value.endPlacement, GRID_PLACEMENT_VALUES)
  ) {
    return false;
  }
  if (!isOptionalEnumMember(value.gridMode, GRID_MODE_VALUES)) return false;
  if (!Number.isInteger(value.stepNumber) || (value.stepNumber as number) < 0) {
    return false;
  }
  if (
    typeof value.duration !== "number" ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0
  ) {
    return false;
  }
  if (value.variation !== undefined) {
    if (!Number.isInteger(value.variation) || (value.variation as number) < 0)
      return false;
  }
  if (value.isBridge !== undefined && typeof value.isBridge !== "boolean")
    return false;
  if (value.isBlank !== undefined && typeof value.isBlank !== "boolean")
    return false;

  if (!isRecord(value.motions)) return false;
  const motions = value.motions as Record<string, unknown>;
  if (!isMotion(motions.left)) return false;
  if (!isMotion(motions.right)) return false;
  // `hand` is optional; if present it must match the channel.
  const leftHand = (motions.left as Motion).hand;
  if (leftHand !== undefined && leftHand !== "left") return false;
  const rightHand = (motions.right as Motion).hand;
  if (rightHand !== undefined && rightHand !== "right") return false;
  return true;
}
