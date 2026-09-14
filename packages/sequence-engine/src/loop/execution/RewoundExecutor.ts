/**
 * Rewound LOOP Executor
 *
 * Temporal transformation that plays the sequence backwards.
 * Appends reversed steps to double the sequence length.
 * Works on ANY sequence regardless of position relationships.
 */

import type { ILOOPExecutor } from "./ILOOPExecutor.js";
import type {
  SequenceStep,
  MotionData,
} from "../../core/types/sequence-engine-types.js";
import type { Period } from "../loop-types.js";

export class RewoundExecutor implements ILOOPExecutor {
  executeLOOP(sequence: SequenceStep[], _period: Period): SequenceStep[] {
    if (sequence.length < 2) {
      throw new Error(
        "Sequence must have at least 2 steps (start position + 1 step)"
      );
    }

    const startPosition = sequence.shift();
    if (!startPosition) {
      throw new Error("Sequence must have a start position");
    }

    const originalSteps = [...sequence];
    const originalLength = originalSteps.length;

    const reversedSteps: SequenceStep[] = [];
    const stepsToReverse = [...originalSteps].reverse();

    for (let i = 0; i < stepsToReverse.length; i++) {
      const sourceStep = stepsToReverse[i]!;
      const newStepNumber = originalLength + i + 1;

      const previousStep =
        i === 0
          ? originalSteps[originalSteps.length - 1]!
          : reversedSteps[i - 1]!;

      const rewoundStep = this.createRewoundStep(
        sourceStep,
        previousStep,
        newStepNumber
      );

      reversedSteps.push(rewoundStep);
    }

    const allSteps = [...originalSteps, ...reversedSteps];
    allSteps.unshift(startPosition);

    return allSteps;
  }

  private createRewoundStep(
    sourceStep: SequenceStep,
    previousStep: SequenceStep,
    newStepNumber: number
  ): SequenceStep {
    return {
      ...sourceStep,
      stepNumber: newStepNumber,
      startPosition: previousStep.endPosition,
      endPosition: sourceStep.startPosition,
      motions: {
        left: this.createRewoundMotion(
          sourceStep.motions.left,
          previousStep.motions.left
        ),
        right: this.createRewoundMotion(
          sourceStep.motions.right,
          previousStep.motions.right
        ),
      },
    };
  }

  private createRewoundMotion(
    sourceMotion: MotionData,
    previousMotion: MotionData
  ): MotionData {
    let reversedRotation = sourceMotion.rotationDirection;
    if (reversedRotation === "cw") {
      reversedRotation = "ccw";
    } else if (reversedRotation === "ccw") {
      reversedRotation = "cw";
    }

    return {
      ...sourceMotion,
      startLocation: previousMotion.endLocation,
      endLocation: sourceMotion.startLocation,
      rotationDirection: reversedRotation,
      ...(sourceMotion.prefloatRotationDirection !== undefined && {
        prefloatRotationDirection:
          sourceMotion.prefloatRotationDirection === "cw"
            ? ("ccw" as MotionData["rotationDirection"])
            : sourceMotion.prefloatRotationDirection === "ccw"
              ? ("cw" as MotionData["rotationDirection"])
              : sourceMotion.prefloatRotationDirection,
      }),
      startOrientation: sourceMotion.endOrientation,
      endOrientation: sourceMotion.startOrientation,
    };
  }
}

export const rewoundExecutor = new RewoundExecutor();
