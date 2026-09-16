/**
 * Prop Type Applier
 *
 * Applies a specific prop type to all motions in a sequence.
 * Creates new objects to avoid mutating the original sequence.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export function applyToSequence(sequence: SequenceData, propType: PropType): SequenceData {
  return {
    ...sequence,
    startPlacement: sequence.startPlacement
      ? applyToStartPlacement(sequence.startPlacement, propType)
      : undefined,
    steps: sequence.steps?.map((step) => applyToBeat(step, propType)) ?? [],
  };
}

function applyToBeat(beat: StepData, propType: PropType): StepData {
  if (!beat.motions) return beat;

  return {
    ...beat,
    motions: {
      left: { ...beat.motions.left, propType },
      right: { ...beat.motions.right, propType },
    },
  };
}

function applyToStartPlacement(
  startPos: StartPlacementData,
  propType: PropType
): StartPlacementData {
  if (!startPos.motions) return startPos;

  return {
    ...startPos,
    motions: {
      left: startPos.motions.left ? { ...startPos.motions.left, propType } : undefined,
      right: startPos.motions.right ? { ...startPos.motions.right, propType } : undefined,
    },
  };
}
