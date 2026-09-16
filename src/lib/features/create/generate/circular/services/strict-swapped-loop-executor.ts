/**
 * Strict Swapped LOOP Executor
 *
 * Supports both halved (period 2) and quartered (period 4) swapped LOOPs.
 *
 * The swap transformation exchanges blue and red hand roles. Applied once
 * (period 2), this produces a sequence where the second half mirrors the
 * first with hands reversed. Applied with per-pass orientation advancement
 * at L3+, it can close at period 4 via the same mechanism documented in
 * StrictMirroredLOOPExecutor.
 *
 * Period 4 structure:
 *   Q1 (steps 1..N)     - partial
 *   Q2 (steps N+1..2N)  - blue/red swapped version of Q1
 *   Q3 (steps 2N+1..3N) - copy of Q1 at advanced orientation
 *   Q4 (steps 3N+1..4N) - swapped version of Q3
 */

import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  SWAPPED_PLACEMENT_MAP,
  SWAPPED_LOOP_VALIDATION_SET,
} from "../domain/constants/strict-loop-placement-maps";
import { Period } from "../domain/models/circular-models";
import { buildStrictQuarters } from "./loop-quarter-guard";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class StrictSwappedLOOPExecutor {
  constructor() {}

  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    this._validateSequence(sequence);

    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    const partialLength = sequence.length;
    const requestedPeriod = period === Period.QUARTERED ? 4 : 2;

    // Odd quarters swap, even quarters copy; stop at period 2 when orientation
    // already closes (see loop-quarter-guard.ts / the YΦΔ×4 defect).
    buildStrictQuarters(
      sequence,
      partialLength,
      requestedPeriod,
      (s, p, n) => this._createSwappedEntry(s, p, n),
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

    if (!SWAPPED_LOOP_VALIDATION_SET.has(key)) {
      const expectedEnd = SWAPPED_PLACEMENT_MAP[startPos as GridPlacement];
      throw new Error(
        `Invalid placement pair for swapped LOOP: ${startPos} → ${endPos}. ` +
          `For a swapped LOOP from ${startPos}, the sequence must end at ${expectedEnd}.`
      );
    }
  }

  private _createSwappedEntry(
    sourceStep: StepData,
    previousStep: StepData,
    stepNumber: number
  ): StepData {
    const sourceLeft = sourceStep.motions[HandSide.LEFT];
    const sourceRight = sourceStep.motions[HandSide.RIGHT];

    if (!sourceLeft || !sourceRight) {
      throw new Error("Source step is missing required motion data");
    }

    const leftMotion = this._createSwappedMotion(
      HandSide.LEFT,
      previousStep,
      sourceRight
    );
    const rightMotion = this._createSwappedMotion(
      HandSide.RIGHT,
      previousStep,
      sourceLeft
    );

    const actualStartPlacement =
      getGridPlacementFromLocations(
        leftMotion.startLocation,
        rightMotion.startLocation
      );
    const actualEndPlacement =
      getGridPlacementFromLocations(
        leftMotion.endLocation,
        rightMotion.endLocation
      );

    const newStep: StepData = {
      ...sourceStep,
      id: `step-${stepNumber}`,
      stepNumber,
      startPlacement: actualStartPlacement,
      endPlacement: actualEndPlacement,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
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

  private _createSwappedMotion(
    hand: HandSide,
    previousStep: StepData,
    matchingMotion: MotionData
  ): MotionData {
    const previousMotion = previousStep.motions[hand];

    if (!previousMotion) {
      throw new Error(`Missing motion data for ${hand}`);
    }

    const startLocation = previousMotion.endLocation;
    const endLocation =
      matchingMotion.motionType === MotionType.STATIC
        ? startLocation
        : matchingMotion.endLocation;

    return {
      ...matchingMotion,
      hand,
      startLocation,
      endLocation,
    };
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const strictSwappedLOOPExecutor = new StrictSwappedLOOPExecutor();
