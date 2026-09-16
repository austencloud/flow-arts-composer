/**
 * Builder / factory helpers for Motion and Step.
 *
 * Every builder:
 *   - Runtime-validates enum membership on every typed field.
 *   - Throws TypeError / RangeError with a descriptive message on invalid input.
 *   - Returns a deep-frozen object so downstream code can rely on immutability
 *     without defensive copies.
 *
 * `updateStep` and `updateMotion` produce a new frozen object with a shallow
 * merge applied; the original is untouched.
 */

import type { Motion, StepMotions, Step } from "./index.js";
import { MotionType } from "./motion-type.js";
import { RotationDirection } from "./rotation-direction.js";
import { Orientation } from "./orientation.js";
import { GridLocation, GridMode, GridPlacement } from "./grid.js";
import { Plane } from "./plane.js";
import { HandSide } from "./hand-side.js";

// Reusable enum-value lookups for fast runtime validation.
const MOTION_TYPE_VALUES = new Set<string>(Object.values(MotionType));
const ROTATION_DIRECTION_VALUES = new Set<string>(Object.values(RotationDirection));
const ORIENTATION_VALUES = new Set<string>(Object.values(Orientation));
const GRID_LOCATION_VALUES = new Set<string>(Object.values(GridLocation));
const GRID_MODE_VALUES = new Set<string>(Object.values(GridMode));
const GRID_PLACEMENT_VALUES = new Set<string>(Object.values(GridPlacement));
const PLANE_VALUES = new Set<string>(Object.values(Plane));
const HAND_SIDE_VALUES = new Set<string>(Object.values(HandSide));

function assertMember(
  value: unknown,
  allowed: Set<string>,
  label: string
): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new TypeError(
      `Invalid ${label}: ${JSON.stringify(value)} is not a recognized enum value`
    );
  }
}

function assertOptionalMember(
  value: unknown,
  allowed: Set<string>,
  label: string
): void {
  if (value === undefined) return;
  assertMember(value, allowed, label);
}

function assertTurns(value: unknown): void {
  if (value === "fl") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  throw new TypeError(
    `Invalid turns: ${JSON.stringify(value)} — expected finite number or "fl"`
  );
}

/**
 *
 * Defaults:
 *   - `plane` defaults to `Plane.wall` when not supplied.
 *
 * Optional:
 *   - `hand` may be omitted; a Motion stored under `step.motions.left` is
 *     definitionally left (and same for right), so hand is redundant there.
 *
 * Throws TypeError on invalid enum membership, on missing required fields,
 * or on invalid `turns` values.
 */
export function createMotion(input: Motion): Motion {
  assertMember(input.motionType, MOTION_TYPE_VALUES, "motionType");
  assertMember(input.startLocation, GRID_LOCATION_VALUES, "startLocation");
  assertMember(input.endLocation, GRID_LOCATION_VALUES, "endLocation");
  assertMember(
    input.rotationDirection,
    ROTATION_DIRECTION_VALUES,
    "rotationDirection"
  );
  assertMember(input.startOrientation, ORIENTATION_VALUES, "startOrientation");
  assertMember(input.endOrientation, ORIENTATION_VALUES, "endOrientation");
  assertTurns(input.turns);
  const plane: Plane = input.plane ?? Plane.wall;
  assertMember(plane, PLANE_VALUES, "plane");
  assertOptionalMember(input.hand, HAND_SIDE_VALUES, "hand");
  assertOptionalMember(
    input.prefloatMotionType,
    MOTION_TYPE_VALUES,
    "prefloatMotionType"
  );
  assertOptionalMember(
    input.prefloatRotationDirection,
    ROTATION_DIRECTION_VALUES,
    "prefloatRotationDirection"
  );

  const frozen: Motion = {
    motionType: input.motionType,
    startLocation: input.startLocation,
    endLocation: input.endLocation,
    rotationDirection: input.rotationDirection,
    startOrientation: input.startOrientation,
    endOrientation: input.endOrientation,
    turns: input.turns,
    plane,
    ...(input.hand !== undefined && { hand: input.hand }),
    ...(input.prefloatMotionType !== undefined && {
      prefloatMotionType: input.prefloatMotionType,
    }),
    ...(input.prefloatRotationDirection !== undefined && {
      prefloatRotationDirection: input.prefloatRotationDirection,
    }),
  };
  return Object.freeze(frozen);
}

export function updateMotion(base: Motion, changes: Partial<Motion>): Motion {
  return createMotion({ ...base, ...changes });
}

function freezeStepMotions(left: Motion, right: Motion): StepMotions {
  if (!Object.isFrozen(left) || !Object.isFrozen(right)) {
    throw new TypeError(
      "Step.motions.left and Step.motions.right must be produced via createMotion (frozen)"
    );
  }
  // `hand` is optional on Motion. When present it must match the channel;
  // when absent, the channel itself ("left"/"right") is definitional.
  if (left.hand !== undefined && left.hand !== "left") {
    throw new TypeError(
      `Step.motions.left.hand must be "left" or undefined, got ${JSON.stringify(left.hand)}`
    );
  }
  if (right.hand !== undefined && right.hand !== "right") {
    throw new TypeError(
      `Step.motions.right.hand must be "right" or undefined, got ${JSON.stringify(right.hand)}`
    );
  }
  return Object.freeze({ left, right });
}

function validateStepScalars(input: Step): void {
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new TypeError("Step.id must be a non-empty string");
  }
  if (!Number.isInteger(input.stepNumber) || input.stepNumber < 0) {
    throw new RangeError(
      `Step.stepNumber must be a non-negative integer, got ${input.stepNumber}`
    );
  }
  if (!Number.isFinite(input.duration) || input.duration <= 0) {
    throw new RangeError(
      `Step.duration must be a positive finite number, got ${input.duration}`
    );
  }
  if (input.startPlacement !== null) {
    assertMember(input.startPlacement, GRID_PLACEMENT_VALUES, "startPlacement");
  }
  if (input.endPlacement !== null) {
    assertMember(input.endPlacement, GRID_PLACEMENT_VALUES, "endPlacement");
  }
  assertOptionalMember(input.gridMode, GRID_MODE_VALUES, "gridMode");
  if (input.variation !== undefined) {
    if (!Number.isInteger(input.variation) || input.variation < 0) {
      throw new RangeError(
        `Step.variation must be a non-negative integer, got ${input.variation}`
      );
    }
  }
}

/**
 * Prefers `crypto.randomUUID` when available; falls back to a time-seeded
 * random string. The returned id is a non-empty string.
 */
function generateStepId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Input for `createStep`.
 *
 * `id` and `duration` are type-level optional — the builder supplies defaults
 * (uuid and `1` respectively) when omitted. All other required `Step` fields
 * are required here as well. The returned `Step` is fully populated and frozen.
 */
export type CreateStepInput = Omit<Step, "id" | "duration"> & {
  readonly id?: string;
  readonly duration?: number;
};

/**
 *
 * Defaults supplied when omitted:
 *   - `id`: `crypto.randomUUID()` (or a time-seeded fallback).
 *   - `duration`: `1` (one musical beat).
 *
 * Rebuilds an immutable copy (freezing both the outer object and the motions
 * record).
 */
export function createStep(input: CreateStepInput): Step {
  const populated: Step = {
    ...input,
    id: input.id && input.id.length > 0 ? input.id : generateStepId(),
    duration: input.duration ?? 1,
  };
  validateStepScalars(populated);
  const motions = freezeStepMotions(populated.motions.left, populated.motions.right);
  const frozen: Step = {
    id: populated.id,
    letter: populated.letter,
    startPlacement: populated.startPlacement,
    endPlacement: populated.endPlacement,
    motions,
    stepNumber: populated.stepNumber,
    duration: populated.duration,
    ...(populated.gridMode !== undefined && { gridMode: populated.gridMode }),
    ...(populated.variation !== undefined && { variation: populated.variation }),
    ...(populated.isBridge !== undefined && { isBridge: populated.isBridge }),
    ...(populated.isBlank !== undefined && { isBlank: populated.isBlank }),
  };
  return Object.freeze(frozen);
}

/**
 *
 * Both hands hold static motions at the center point with radial orientation.
 * `letter` is null (start placement has no letter).
 */
export function createStartStep(pos: GridPlacement): Step {
  const staticBlue = createMotion({
    motionType: MotionType.static,
    startLocation: GridLocation.n,
    endLocation: GridLocation.n,
    rotationDirection: RotationDirection.noRotation,
    startOrientation: Orientation.in,
    endOrientation: Orientation.in,
    turns: 0,
    plane: Plane.wall,
    hand: HandSide.LEFT,
  });
  const staticRed = createMotion({
    motionType: MotionType.static,
    startLocation: GridLocation.n,
    endLocation: GridLocation.n,
    rotationDirection: RotationDirection.noRotation,
    startOrientation: Orientation.in,
    endOrientation: Orientation.in,
    turns: 0,
    plane: Plane.wall,
    hand: HandSide.RIGHT,
  });
  return createStep({
    id: `step-0-${pos}`,
    letter: null,
    startPlacement: pos,
    endPlacement: pos,
    motions: { left: staticBlue, right: staticRed },
    stepNumber: 0,
    duration: 1,
  });
}

/**
 * Validations re-run on the merged object.
 */
export function updateStep(base: Step, changes: Partial<Step>): Step {
  const merged: Step = { ...base, ...changes };
  // If motions changed, route through createStep's freezing path.
  if (changes.motions) {
    return createStep(merged);
  }
  return createStep(merged);
}
