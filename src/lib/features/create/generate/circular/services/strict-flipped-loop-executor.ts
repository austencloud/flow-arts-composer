/**
 * Strict Flipped LOOP Executor
 *
 * Supports both halved (period 2) and quartered (period 4) flipped LOOPs.
 *
 * Period 2 (halved):
 *   Q1 (steps 1..N)     - partial
 *   Q2 (steps N+1..2N)  - horizontal flip (N↔S) of Q1
 *
 * Period 4 (quartered):
 *   Q1, Q2 as above, plus
 *   Q3 (steps 2N+1..3N) - copy of Q1 with new start orientation
 *   Q4 (steps 3N+1..4N) - horizontal flip of Q3
 *
 * See StrictMirroredLOOPExecutor for a full explanation of the period-4
 * mechanism.
 */

import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  RotationDirection,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  GridPlacement,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_LOCATION_MAP,
  FLIPPED_LOOP_VALIDATION_SET,
} from "../domain/constants/strict-loop-placement-maps";
import { Period } from "../domain/models/circular-models";
import { buildStrictQuarters } from "./loop-quarter-guard";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class StrictFlippedLOOPExecutor {
  constructor() {}

  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    this._validateSequence(sequence);

    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    const partialLength = sequence.length;
    const requestedPeriod = period === Period.QUARTERED ? 4 : 2;

    // Odd quarters flip, even quarters copy; stop at period 2 when orientation
    // already closes (see loop-quarter-guard.ts / the YΦΔ×4 defect).
    buildStrictQuarters(
      sequence,
      partialLength,
      requestedPeriod,
      (s, p, n) => this._createFlippedEntry(s, p, n),
      (s, p, n) => this._createCopiedEntry(s, p, n),
    );

    sequence.unshift(startPlacement);
    return sequence;
  }

  private _validateSequence(sequence: StepData[]): void {
    if (sequence.length < 2) {
      throw new Error(
        "Sequence must have at least 2 steps (start placement + 1 step)"
      );
    }

    const startPos = sequence[0]!.startPlacement;
    const endPos = sequence[sequence.length - 1]!.endPlacement;

    if (!startPos || !endPos) {
      throw new Error("Sequence steps must have valid start and end placements");
    }

    const key = `${startPos},${endPos}`;

    if (!FLIPPED_LOOP_VALIDATION_SET.has(key)) {
      const expectedEnd =
        HORIZONTAL_MIRROR_PLACEMENT_MAP[startPos as GridPlacement];
      throw new Error(
        `Invalid placement pair for flipped LOOP: ${startPos} → ${endPos}. ` +
          `For a flipped LOOP from ${startPos}, the sequence must end at ${expectedEnd}.`
      );
    }
  }

  private _createFlippedEntry(
    sourceStep: StepData,
    previousStep: StepData,
    stepNumber: number
  ): StepData {
    const newEndPlacement = this._getFlippedPlacement(sourceStep);

    const newStep: StepData = {
      ...sourceStep,
      id: `step-${stepNumber}`,
      stepNumber,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: newEndPlacement,
      motions: {
        [HandSide.LEFT]: this._createFlippedMotion(
          HandSide.LEFT,
          previousStep,
          sourceStep
        ),
        [HandSide.RIGHT]: this._createFlippedMotion(
          HandSide.RIGHT,
          previousStep,
          sourceStep
        ),
      },
    };

    const stepWithStartOri = updateStartOrientations(
      newStep,
      previousStep
    );
    return updateEndOrientations(stepWithStartOri);
  }

  private _createCopiedEntry(
    sourceStep: StepData,
    previousStep: StepData,
    stepNumber: number
  ): StepData {
    const sourceLeft = sourceStep.motions[HandSide.LEFT];
    const sourceRight = sourceStep.motions[HandSide.RIGHT];
    if (!sourceLeft || !sourceRight) {
      throw new Error(
        `Source step ${sourceStep.stepNumber} is missing motion data`
      );
    }

    const newStep: StepData = {
      ...sourceStep,
      id: `step-${stepNumber}`,
      stepNumber,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: sourceStep.endPlacement,
      motions: {
        [HandSide.LEFT]: {
          ...sourceLeft,
          startLocation:
            previousStep.motions[HandSide.LEFT]?.endLocation ??
            sourceLeft.startLocation,
        },
        [HandSide.RIGHT]: {
          ...sourceRight,
          startLocation:
            previousStep.motions[HandSide.RIGHT]?.endLocation ??
            sourceRight.startLocation,
        },
      },
    };

    const stepWithStartOri = updateStartOrientations(
      newStep,
      previousStep
    );
    return updateEndOrientations(stepWithStartOri);
  }

  private _getFlippedPlacement(sourceStep: StepData): GridPlacement | null {
    const endPos = sourceStep.endPlacement;
    if (!endPos) {
      throw new Error("Source step must have an end placement");
    }
    return HORIZONTAL_MIRROR_PLACEMENT_MAP[endPos as GridPlacement];
  }

  private _createFlippedMotion(
    color: HandSide,
    previousStep: StepData,
    sourceStep: StepData
  ): MotionData {
    const previousMotion = previousStep.motions[color];
    const sourceMotion = sourceStep.motions[color];

    if (!previousMotion || !sourceMotion) {
      throw new Error(`Missing motion data for ${color}`);
    }

    return {
      ...sourceMotion,
      startLocation: previousMotion.endLocation,
      endLocation: this._getFlippedLocation(
        sourceMotion.endLocation as GridLocation
      ),
      rotationDirection: this._getFlippedPropRotDir(
        sourceMotion.rotationDirection
      ),
    };
  }

  private _getFlippedLocation(location: GridLocation): GridLocation {
    return HORIZONTAL_MIRROR_LOCATION_MAP[location];
  }

  private _getFlippedPropRotDir(
    propRotDir: RotationDirection
  ): RotationDirection {
    if (propRotDir === RotationDirection.CLOCKWISE) {
      return RotationDirection.COUNTER_CLOCKWISE;
    } else if (propRotDir === RotationDirection.COUNTER_CLOCKWISE) {
      return RotationDirection.CLOCKWISE;
    }
    return propRotDir;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const strictFlippedLOOPExecutor = new StrictFlippedLOOPExecutor();
