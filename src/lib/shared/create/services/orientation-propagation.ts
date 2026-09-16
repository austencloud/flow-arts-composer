/**
 * Orientation Propagation
 *
 * Functions for propagating prop orientations through a sequence.
 * Ensures orientation chain integrity after transforms.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";

/**
 * Propagate orientations for one hand through all steps.
 * Each beat's start orientation = previous beat's end orientation.
 */
export function propagateOrientationsForHand(
  steps: StepData[],
  hand: HandSide,
  initialOrientation: Orientation
): StepData[] {
  const updatedSteps = [...steps];
  let previousEndOrientation: Orientation = initialOrientation;

  for (let i = 0; i < updatedSteps.length; i++) {
    const beat = updatedSteps[i];
    if (!beat?.motions) continue;

    const motion = beat.motions[hand];
    if (!motion) continue;

    // Calculate new end orientation based on this beat's motion
    const tempMotionData = createMotionData({
      ...motion,
      startOrientation: previousEndOrientation,
    });

    const newEndOrientation = calculateEndOrientation(tempMotionData, hand);

    // Update this beat with correct orientations
    updatedSteps[i] = {
      ...beat,
      motions: {
        ...beat.motions,
        [hand]: {
          ...motion,
          startOrientation: previousEndOrientation,
          endOrientation: newEndOrientation,
        },
      },
    };

    previousEndOrientation = newEndOrientation;
  }

  return updatedSteps;
}

/**
 * Recalculate all prop orientations through the entire sequence.
 * Uses the start placement orientations as the baseline.
 */
export function recalculateAllOrientations(
  sequence: SequenceData
): SequenceData {
  if (sequence.steps.length === 0 || !sequence.startPlacement) {
    return sequence;
  }

  const startPlacement = sequence.startPlacement;
  let updatedSteps = [...sequence.steps];
  const leftStartMotion = startPlacement.motions[HandSide.LEFT];
  const rightStartMotion = startPlacement.motions[HandSide.RIGHT];

  // Recalculate orientations for the left prop
  if (leftStartMotion) {
    const leftStartOrientation = leftStartMotion.endOrientation;
    updatedSteps = propagateOrientationsForHand(
      updatedSteps,
      HandSide.LEFT,
      leftStartOrientation
    );
  }

  // Recalculate orientations for the right prop
  if (rightStartMotion) {
    const rightStartOrientation = rightStartMotion.endOrientation;
    updatedSteps = propagateOrientationsForHand(
      updatedSteps,
      HandSide.RIGHT,
      rightStartOrientation
    );
  }

  return updateSequenceData(sequence, { steps: updatedSteps });
}
