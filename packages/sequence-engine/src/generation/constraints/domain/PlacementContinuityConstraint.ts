/**
 * Placement Continuity Constraint
 *
 * Sequences must be physically continuous — each step's start placement
 * must match the previous step's end placement. You can't teleport your
 * hands between steps. This is the most fundamental hard constraint
 * in sequence generation.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  IConstraint,
  ConstraintContext,
  ConstraintScore,
} from "../types.js";

export class PlacementContinuityConstraint implements IConstraint {
  readonly type = ConstraintType.PLACEMENT_CONTINUITY;
  readonly mode: ConstraintMode = "hard";
  readonly description =
    "Ensures placement continuity between consecutive steps";

  evaluate(context: ConstraintContext): ConstraintScore {
    if (context.previousSteps.length === 0) {
      return {
        score: 1,
        satisfied: true,
        reason: "First step - no continuity required",
      };
    }

    const lastStep = context.previousSteps[context.previousSteps.length - 1]!;
    const prevEnd = lastStep.endPlacement;
    const candidateStart = context.candidate.startPlacement;

    if (prevEnd === candidateStart) {
      return {
        score: 1,
        satisfied: true,
        reason: "Placement continuity maintained",
      };
    }

    return {
      score: 0,
      satisfied: false,
      reason: `Placement break: previous ended at ${prevEnd}, candidate starts at ${candidateStart}`,
    };
  }
}
