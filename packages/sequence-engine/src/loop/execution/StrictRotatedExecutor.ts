/**
 * Strict Rotated LOOP Executor
 *
 * Rotates hand locations based on the handpath direction of each motion.
 * Supports both halved (period 2, 180 degree) and quartered (period 4, 90 degree).
 */

import type { ILOOPExecutor } from "./ILOOPExecutor.js";
import type {
  SequenceStep,
  MotionData,
} from "../../core/types/sequence-engine-types.js";
import { Period } from "../loop-types.js";
import {
  HALVED_LOOPS,
  QUARTERED_LOOPS,
  translateHandPath,
} from "../placement-maps/circular-placement-maps.js";
import { gridPlacementDeriver } from "../../core/placements/GridPlacementDeriver.js";
import { updateStepOrientations } from "./orientation-helpers.js";

export class StrictRotatedExecutor implements ILOOPExecutor {
  executeLOOP(sequence: SequenceStep[], period: Period): SequenceStep[] {
    this.validateSequence(sequence, period);

    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    const sequenceLength = sequence.length;
    const entriesToAdd =
      period === Period.HALVED ? sequenceLength : sequenceLength * 3;

    let lastStep = sequence[sequence.length - 1]!;
    let nextStepNumber = (lastStep.stepNumber ?? lastStep.stepNumber) + 1;

    for (let i = 0; i < entriesToAdd; i++) {
      const finalIntendedLength = sequenceLength + entriesToAdd;
      const matchingStep = this.getPreviousMatchingStep(
        sequence,
        nextStepNumber,
        finalIntendedLength,
        period
      );

      const newStep = this.createRotatedStep(
        matchingStep,
        lastStep,
        nextStepNumber
      );
      const finalStep = updateStepOrientations(newStep, lastStep);

      sequence.push(finalStep);
      lastStep = finalStep;
      nextStepNumber++;
    }

    sequence.unshift(startPlacement);
    return sequence;
  }

  private validateSequence(sequence: SequenceStep[], period: Period): void {
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
    const validationSet =
      period === Period.HALVED ? HALVED_LOOPS : QUARTERED_LOOPS;

    if (!validationSet.has(key)) {
      throw new Error(
        `Invalid placement pair for ${period} LOOP: ${startPos} -> ${endPos}. ` +
          `This pair cannot complete a ${period} rotation.`
      );
    }
  }

  private getPreviousMatchingStep(
    sequence: SequenceStep[],
    stepNumber: number,
    finalLength: number,
    period: Period
  ): SequenceStep {
    const sliceLength =
      period === Period.QUARTERED
        ? Math.floor(finalLength / 4)
        : Math.floor(finalLength / 2);

    const matchingStepNumber =
      stepNumber > sliceLength ? stepNumber - sliceLength : stepNumber;
    const arrayIndex = matchingStepNumber - 1;

    if (arrayIndex < 0 || arrayIndex >= sequence.length) {
      throw new Error(
        `Invalid index mapping: stepNumber ${stepNumber} -> arrayIndex ${arrayIndex} (sequence length: ${sequence.length})`
      );
    }

    return sequence[arrayIndex]!;
  }

  private createRotatedStep(
    matchingStep: SequenceStep,
    previousStep: SequenceStep,
    stepNumber: number
  ): SequenceStep {
    const newLeftEndLoc = translateHandPath(
      matchingStep.motions.left.startLocation,
      matchingStep.motions.left.endLocation,
      previousStep.motions.left.endLocation
    );
    const newRightEndLoc = translateHandPath(
      matchingStep.motions.right.startLocation,
      matchingStep.motions.right.endLocation,
      previousStep.motions.right.endLocation
    );

    const newEndPlacement = gridPlacementDeriver.getGridPlacementFromLocations(
      newLeftEndLoc,
      newRightEndLoc
    );

    return {
      ...matchingStep,
      stepNumber,
      startPlacement: previousStep.endPlacement as SequenceStep["startPlacement"],
      endPlacement: newEndPlacement as SequenceStep["endPlacement"],
      motions: {
        left: {
          ...matchingStep.motions.left,
          startLocation: previousStep.motions.left
            .endLocation as MotionData["startLocation"],
          endLocation: newLeftEndLoc as MotionData["endLocation"],
        },
        right: {
          ...matchingStep.motions.right,
          startLocation: previousStep.motions.right
            .endLocation as MotionData["startLocation"],
          endLocation: newRightEndLoc as MotionData["endLocation"],
        },
      },
    };
  }
}

export const strictRotatedExecutor = new StrictRotatedExecutor();
