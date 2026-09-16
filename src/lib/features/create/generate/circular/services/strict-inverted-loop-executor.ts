/**
 * Strict Inverted LOOP Executor
 *
 * Supports both halved (period 2) and quartered (period 4) inverted LOOPs.
 *
 * Inverted is the pro↔anti and CW↔CCW flip. Placements stay the same (start
 * and end placements equal). Period 2 applies one inversion; period 4 applies
 * two inversions with orientation evolving between, matching the structure
 * in StrictMirroredLOOPExecutor.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  MotionType,
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  updateStartOrientations,
  updateEndOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  INVERTED_LOOP_VALIDATION_SET,
  getInvertedLetter,
} from "../domain/constants/strict-loop-placement-maps";
import { Period } from "../domain/models/circular-models";
import { buildStrictQuarters } from "./loop-quarter-guard";

export class StrictInvertedLOOPExecutor {
  constructor() {}

  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    this._validateSequence(sequence);

    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    const partialLength = sequence.length;
    const requestedPeriod = period === Period.QUARTERED ? 4 : 2;

    // Odd quarters invert, even quarters copy; stop at period 2 when orientation
    // already closes (see loop-quarter-guard.ts / the YΦΔ×4 defect).
    buildStrictQuarters(
      sequence,
      partialLength,
      requestedPeriod,
      (s, p, n) => this._createInvertedEntry(s, p, n),
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

    if (!INVERTED_LOOP_VALIDATION_SET.has(key)) {
      throw new Error(
        `Invalid placement pair for inverted LOOP: ${startPos} → ${endPos}. ` +
          `For an inverted LOOP, the sequence must end at the same placement it started (${startPos}).`
      );
    }
  }

  private _createInvertedEntry(
    sourceStep: StepData,
    previousStep: StepData,
    stepNumber: number
  ): StepData {
    const invertedLetter = this._getInvertedLetter(sourceStep);

    const newStep: StepData = {
      ...sourceStep,
      id: `step-${stepNumber}`,
      stepNumber,
      letter: invertedLetter,
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: sourceStep.endPlacement ?? null,
      motions: {
        [HandSide.LEFT]: this._createInvertedMotion(
          HandSide.LEFT,
          previousStep,
          sourceStep
        ),
        [HandSide.RIGHT]: this._createInvertedMotion(
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

  private _getInvertedLetter(sourceStep: StepData): Letter {
    const letter = sourceStep.letter;
    if (!letter) {
      throw new Error("Source step must have a letter");
    }
    return getInvertedLetter(letter as string) as Letter;
  }

  private _createInvertedMotion(
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
      motionType: this._getInvertedMotionType(
        sourceMotion.motionType as MotionType
      ),
      startLocation: previousMotion.endLocation,
      endLocation: sourceMotion.endLocation,
      rotationDirection: this._getInvertedPropRotDir(
        sourceMotion.rotationDirection as RotationDirection
      ),
    };
  }

  private _getInvertedMotionType(motionType: MotionType): MotionType {
    if (motionType === MotionType.PRO) return MotionType.ANTI;
    if (motionType === MotionType.ANTI) return MotionType.PRO;
    return motionType;
  }

  private _getInvertedPropRotDir(
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
export const strictInvertedLOOPExecutor = new StrictInvertedLOOPExecutor();
