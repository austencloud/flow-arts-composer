/**
 * Implementation-independent invariants for a completed LOOP.
 *
 * These do NOT ask "does the app agree with the engine". They ask "is this
 * output internally coherent at all", using the app's own canonical grid
 * deriver. That matters for an audit: when the two paths disagree, an
 * invariant violation tells you which side is wrong without having to assume
 * either implementation is canonical.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { getGridPositionFromLocations } from "$lib/shared/pictograph/grid/services/grid-position-deriver";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export interface InvariantViolation {
  readonly stepIndex: number;
  readonly rule:
    | "end-position-matches-hands"
    | "start-position-chains"
    | "hand-locations-chain"
    | "undeliverable-position";
  readonly detail: string;
}

/**
 * Every step must satisfy:
 *   1. `endPosition` is the grid position of its own two hands' end locations;
 *   2. `startPosition` equals the previous step's `endPosition`;
 *   3. each hand's `startLocation` equals that hand's previous `endLocation`.
 *
 * (1) is the one that catches a transform which moves the hands one way and
 * labels the result another — a step whose stored position contradicts its own
 * motion data is wrong under any LOOP algebra.
 */
export function checkStepCoherence(steps: StepData[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    const previous = steps[i - 1]!;

    let derived: string | null = null;
    try {
      derived = getGridPositionFromLocations(
        step.motions.left.endLocation as GridLocation,
        step.motions.right.endLocation as GridLocation
      );
    } catch (error) {
      violations.push({
        stepIndex: i,
        rule: "undeliverable-position",
        detail: `hands ${step.motions.left.endLocation}/${step.motions.right.endLocation}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }

    if (derived !== null && derived !== step.endPosition) {
      violations.push({
        stepIndex: i,
        rule: "end-position-matches-hands",
        detail: `stored ${step.endPosition}, hands ${step.motions.left.endLocation}/${step.motions.right.endLocation} → ${derived}`,
      });
    }

    if (step.startPosition !== previous.endPosition) {
      violations.push({
        stepIndex: i,
        rule: "start-position-chains",
        detail: `startPosition ${step.startPosition} after previous endPosition ${previous.endPosition}`,
      });
    }

    for (const side of ["left", "right"] as const) {
      if (
        step.motions[side].startLocation !== previous.motions[side].endLocation
      ) {
        violations.push({
          stepIndex: i,
          rule: "hand-locations-chain",
          detail: `${side} starts at ${step.motions[side].startLocation} after previous end ${previous.motions[side].endLocation}`,
        });
      }
    }
  }

  return violations;
}

/**
 * A LOOP must return to its start position. Both pipelines depend on this:
 * the app's executors validate the seed's position pair specifically to
 * guarantee it, and the engine's `closeOrientationCycle` throws
 * ("Cannot close orientation on an open position pattern") when it does not
 * hold.
 */
export function positionCloses(steps: StepData[]): boolean {
  return steps[steps.length - 1]!.endPosition === steps[0]!.startPosition;
}
