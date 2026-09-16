/**
 * Rewound LOOP Executor
 *
 * Executes the Rewound LOOP (Linked Orbital Offset Pattern) by:
 * 1. Taking an existing sequence
 * 2. Reversing the steps and swapping their start/end placements
 * 3. Appending the reversed steps to double the sequence length
 *
 * Unlike traditional LOOPs which use geometric transformations (rotate, mirror, swap),
 * Rewound is a temporal transformation that plays the sequence backwards.
 *
 * Example: [1, 2, 3, 4] → [1, 2, 3, 4, 4', 3', 2', 1']
 * where each reversed step has swapped start/end placements and reversed motion directions.
 *
 * IMPORTANT: Rewound works on ANY sequence regardless of placement relationships.
 * No placement validation is needed (unlike rotation-based LOOPs).
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  createPlaceholderMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Period } from "../domain/models/circular-models";
import type { ILOOPExecutor } from "./ILOOPExecutor";
import { LoopViabilityError } from "../../shared/domain/errors/loop-viability-error";

export class RewoundLOOPExecutor implements ILOOPExecutor {
  /**
   * Execute the Rewound LOOP
   *
   * @param sequence - The partial sequence to extend (must include start placement at index 0)
   * @param _period - Ignored (Rewound always doubles the sequence)
   * @returns The complete sequence with reversed steps appended
   */
  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    if (period === Period.QUARTERED) {
      throw new LoopViabilityError(
        "Quartered rewound is not a valid LOOP.",
        "Rewound is order 2 (reverse-of-reverse = identity). Use halved or pick a rotation-containing type."
      );
    }

    if (sequence.length < 2) {
      throw new Error(
        "Sequence must have at least 2 steps (start placement + 1 step)"
      );
    }

    // Remove start placement (index 0) for processing
    const startPlacement = sequence.shift();
    if (!startPlacement) {
      throw new Error("Sequence must have a start placement");
    }

    // Get the actual steps (without start placement)
    const originalSteps = [...sequence];
    const originalLength = originalSteps.length;

    const reversedSteps: StepData[] = [];
    const beatsToReverse = [...originalSteps].reverse();

    for (let i = 0; i < beatsToReverse.length; i++) {
      const sourceStep = beatsToReverse[i]!;
      const newStepNumber = originalLength + i + 1;

      // Get the previous step's end placement for continuity
      const previousStep =
        i === 0
          ? originalSteps[originalSteps.length - 1]!
          : reversedSteps[i - 1]!;

      const rewoundBeat = this.createRewoundBeat(
        sourceStep,
        previousStep,
        newStepNumber
      );

      reversedSteps.push(rewoundBeat);
    }

    // Combine: original steps + reversed steps
    const allSteps = [...originalSteps, ...reversedSteps];

    // Re-insert start placement at the beginning
    allSteps.unshift(startPlacement);

    return allSteps;
  }

  /**
   * Create a rewound step from a source step
   * Swaps start/end placements and reverses motion directions
   */
  private createRewoundBeat(
    sourceStep: StepData,
    previousStep: StepData,
    newStepNumber: number
  ): StepData {
    return {
      ...sourceStep,
      id: `step-${newStepNumber}`,
      stepNumber: newStepNumber,
      // Swap placements: new start = previous end, new end = source's start
      startPlacement: previousStep.endPlacement ?? null,
      endPlacement: sourceStep.startPlacement ?? null,
      // Reverse motions
      motions: {
        [HandSide.LEFT]: this.createRewoundMotion(
          HandSide.LEFT,
          sourceStep.motions[HandSide.LEFT],
          previousStep.motions[HandSide.LEFT]
        ),
        [HandSide.RIGHT]: this.createRewoundMotion(
          HandSide.RIGHT,
          sourceStep.motions[HandSide.RIGHT],
          previousStep.motions[HandSide.RIGHT]
        ),
      },
      // Swap reversals
      leftReversal: sourceStep.rightReversal ?? false,
      rightReversal: sourceStep.leftReversal ?? false,
    };
  }

  /**
   * Create a rewound motion from source motion
   * Swaps start/end locations and reverses rotation direction
   */
  private createRewoundMotion(
    color: HandSide,
    sourceMotion: MotionData | undefined,
    previousMotion: MotionData | undefined
  ): MotionData {
    if (!sourceMotion) {
      return createPlaceholderMotion(color);
    }

    // Reverse rotation direction
    const reversedRotation = this.reverseRotationDirection(
      sourceMotion.rotationDirection as RotationDirection
    );

    return {
      ...sourceMotion,
      // Swap locations: new start = previous end, new end = source's start
      startLocation: previousMotion?.endLocation ?? sourceMotion.endLocation,
      endLocation: sourceMotion.startLocation,
      // Reverse rotation direction
      rotationDirection: reversedRotation,
      // Swap orientations
      startOrientation: sourceMotion.endOrientation,
      endOrientation: sourceMotion.startOrientation,
    };
  }

  /**
   * Reverse rotation direction (CLOCKWISE ↔ COUNTER_CLOCKWISE)
   */
  private reverseRotationDirection(
    direction: RotationDirection
  ): RotationDirection {
    if (direction === RotationDirection.CLOCKWISE) {
      return RotationDirection.COUNTER_CLOCKWISE;
    } else if (direction === RotationDirection.COUNTER_CLOCKWISE) {
      return RotationDirection.CLOCKWISE;
    }
    return direction; // NO_ROTATION stays NO_ROTATION
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const rewoundLOOPExecutor = new RewoundLOOPExecutor();
