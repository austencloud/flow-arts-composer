/**
 * Hand Relationship Constraint
 *
 * Ties the left hand to the right hand inside one step: the left motion's
 * locations must be the right motion's locations passed through a fixed map,
 * and the motion types must match (or be pro/anti swapped when inverted).
 *
 * This is a per-step, spatial relationship. The LOOP transforms in `loop/`
 * relate one step to a later one; this relates the two hands of the same
 * step. The two compose.
 *
 * Turns, floats, orientations and the direction a dash or static spins once
 * turns are added are all left alone. PictographData is evaluated before
 * turn allocation, so the predicate only ever sees the dataset's
 * pro/anti/dash/static and locations.
 *
 * Written against location maps, not letters, so the grid-mode dependency
 * (D/E/J/K mirror in diamond, M/N/P/Q mirror in box) comes out of the data.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  IVariationConstraint,
  ConstraintContext,
  ConstraintScore,
  PictographData,
  MotionData,
} from "../types.js";
import { REFLECTION_LOCATION_MAPS } from "../../../loop/position-maps/strict-loop-position-maps.js";
import {
  IDENTITY_LOCATION_MAP,
  ROTATE_180_LOCATION_MAP,
} from "../../../loop/detection/pair-relation.js";

export type HandRelationshipMap =
  | "identity"
  | "rotate-180"
  | "reflect-north-south"
  | "reflect-east-west";

export interface HandRelationshipOptions {
  /** How the right hand's locations map onto the left hand's. */
  map: HandRelationshipMap;
  /** Pro on one hand is anti on the other. Dash and static are unaffected. */
  inverted?: boolean;
}

export const HAND_RELATIONSHIP_LOCATION_MAPS: Readonly<
  Record<HandRelationshipMap, Readonly<Record<string, string>>>
> = {
  identity: IDENTITY_LOCATION_MAP,
  "rotate-180": ROTATE_180_LOCATION_MAP,
  "reflect-north-south": REFLECTION_LOCATION_MAPS["north-south"],
  "reflect-east-west": REFLECTION_LOCATION_MAPS["east-west"],
};

const REFLECTIONS: ReadonlySet<HandRelationshipMap> = new Set([
  "reflect-north-south",
  "reflect-east-west",
]);

const PRO_ANTI = new Set(["pro", "anti"]);

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function motionTypesRelate(
  left: string,
  right: string,
  inverted: boolean
): boolean {
  if (!inverted) return left === right;
  // Inverted swaps pro and anti. Dash and static carry nothing to swap, so
  // they still have to match each other.
  if (PRO_ANTI.has(left) && PRO_ANTI.has(right)) return left !== right;
  return left === right;
}

/**
 * A reflection flips the hand path, so a reflected pro spins the other way;
 * inversion flips it back. Identity and rotation keep the hand path, so the
 * spin matches unless inverted. Only shifts carry a spin at this stage; a
 * dash or static gets its direction from turns later and is not checked.
 */
function spinRelates(
  left: MotionData,
  right: MotionData,
  reflection: boolean,
  inverted: boolean
): boolean {
  const lt = lower(left.motionType);
  const rt = lower(right.motionType);
  if (!PRO_ANTI.has(lt) || !PRO_ANTI.has(rt)) return true;
  const expectOpposite = reflection !== inverted;
  const same =
    lower(left.rotationDirection) === lower(right.rotationDirection);
  return expectOpposite ? !same : same;
}

/**
 * The spin the left hand should have once the right hand's is known, for a
 * dash or static that gained turns after the dataset row was chosen. Same
 * rule as spinRelates: a reflection flips it, inversion flips it back.
 * Undefined when the right hand is not spinning (nothing to relate to).
 */
export function relatedRotationDirection(
  rightDirection: string | undefined,
  options: HandRelationshipOptions
): "cw" | "ccw" | undefined {
  const r = lower(rightDirection);
  if (r !== "cw" && r !== "ccw") return undefined;
  const flip = REFLECTIONS.has(options.map) !== (options.inverted === true);
  if (!flip) return r;
  return r === "cw" ? "ccw" : "cw";
}

/** True when `left` is `right` under the relationship. */
export function handRelationshipHolds(
  left: MotionData,
  right: MotionData,
  options: HandRelationshipOptions
): boolean {
  const map = HAND_RELATIONSHIP_LOCATION_MAPS[options.map];
  const start = map[lower(right.startLocation)];
  const end = map[lower(right.endLocation)];
  if (!start || !end) return false;
  if (lower(left.startLocation) !== start) return false;
  if (lower(left.endLocation) !== end) return false;
  const inverted = options.inverted === true;
  if (
    !motionTypesRelate(lower(left.motionType), lower(right.motionType), inverted)
  ) {
    return false;
  }
  return spinRelates(left, right, REFLECTIONS.has(options.map), inverted);
}

export class HandRelationshipConstraint implements IVariationConstraint {
  readonly type = ConstraintType.HAND_RELATIONSHIP;
  readonly mode: ConstraintMode = "hard";
  readonly description: string;

  constructor(private readonly options: HandRelationshipOptions) {
    this.description = `Left hand is the right hand under ${options.map}${
      options.inverted ? ", inverted" : ""
    }`;
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const ok = this.couldSatisfy(context.candidate);
    return {
      score: ok ? 1 : 0,
      satisfied: ok,
      reason: ok
        ? `Hands relate by ${this.options.map}`
        : `Left hand is not the right hand under ${this.options.map}`,
    };
  }

  couldSatisfy(candidate: PictographData): boolean {
    return handRelationshipHolds(
      candidate.leftMotion,
      candidate.rightMotion,
      this.options
    );
  }
}
