// src/generation/constraints/style/prop-relationship-constraint.ts
/**
 * Prop Relationship Constraint
 *
 * Holds the two props in a requested spin relation inside one step, and with
 * a timing keeps the step from drifting the props' phase.
 *
 * A shift's spin is fixed by the dataset (pro or anti on a given hand path),
 * so two shifts can be checked per candidate. A dash or static gets its spin
 * from turns later; the builder forces that spin from the right hand through
 * the LeftSpinRule, so those pairs pass here.
 *
 * With a timing set, a shift paired with a dash or static is rejected: a
 * shift moves the prop a quarter turn plus its turns, a dash or static only
 * its turns, so the pair changes the phase by a quarter and the timing would
 * not survive the step. Equal turns (forced at allocation) keep everything
 * else invariant. See generation/prop-relationship.ts for the phase law.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  IVariationConstraint,
  ConstraintContext,
  ConstraintScore,
  PictographData,
} from "../types.js";
import type { PropDirection, PropTiming } from "../../prop-relationship.js";

export interface PropRelationshipOptions {
  /** Same spin or opposite spin. */
  direction: PropDirection;
  /** Together, Split or Quarter. Absent: direction only. */
  timing?: PropTiming;
}

const SHIFTS = new Set(["pro", "anti"]);

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

/**
 * The spin the left prop takes once the right prop's is known. Undefined when
 * the right prop is not spinning (nothing to relate to).
 */
export function propRelatedRotationDirection(
  rightDirection: string | undefined,
  direction: PropDirection
): "cw" | "ccw" | undefined {
  const r = lower(rightDirection);
  if (r !== "cw" && r !== "ccw") return undefined;
  if (direction === "same") return r;
  return r === "cw" ? "ccw" : "cw";
}

/** Whether this dataset row can carry the relation once turns are applied. */
export function propRelationshipCouldHold(
  candidate: PictographData,
  options: PropRelationshipOptions
): boolean {
  const left = candidate.leftMotion;
  const right = candidate.rightMotion;
  const leftShift = SHIFTS.has(lower(left.motionType));
  const rightShift = SHIFTS.has(lower(right.motionType));
  if (options.timing && leftShift !== rightShift) return false;
  if (!leftShift || !rightShift) return true;
  const same = lower(left.rotationDirection) === lower(right.rotationDirection);
  return options.direction === "same" ? same : !same;
}

export class PropRelationshipConstraint implements IVariationConstraint {
  readonly type = ConstraintType.PROP_RELATIONSHIP;
  readonly mode: ConstraintMode = "hard";
  readonly description: string;

  constructor(private readonly options: PropRelationshipOptions) {
    this.description = `Props spin ${options.direction}${
      options.timing ? ` and sit ${options.timing}` : ""
    }`;
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const ok = this.couldSatisfy(context.candidate);
    return {
      score: ok ? 1 : 0,
      satisfied: ok,
      reason: ok
        ? `Props relate ${this.options.direction}`
        : `Cannot hold: ${this.description}`,
    };
  }

  couldSatisfy(candidate: PictographData): boolean {
    return propRelationshipCouldHold(candidate, this.options);
  }
}
