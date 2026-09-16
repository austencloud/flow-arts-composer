/**
 * Position Deriver Service Implementation
 *
 * Derives start/end positions from motion data for deep link sequences.
 * Uses grid position deriver to calculate positions based on hand locations.
 *
 * Domain: Navigation - Position Derivation
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export async function derivePositionsForSequence(
  sequence: SequenceData
): Promise<SequenceData> {
  // Derive positions for all steps in the sequence
  const beatsWithPositions = sequence.steps.map((step) =>
    derivePositionsForBeat(step)
  ) as StepData[];

  // Derive positions for start position if it exists
  let updatedStartPlacement: StartPlacementData | null | undefined =
    sequence.startPlacement;
  let updatedStartingPlacementStep: StartPlacementData | undefined =
    sequence.startingPlacement;

  if (sequence.startPlacement) {
    // Cast is safe - we pass StartPlacementData so we get StartPlacementData back
    updatedStartPlacement = derivePositionsForBeat(
      sequence.startPlacement
    ) as StartPlacementData;
  }

  if (sequence.startingPlacement) {
    // Cast is safe - we pass StartPlacementData so we get StartPlacementData back
    updatedStartingPlacementStep = derivePositionsForBeat(
      sequence.startingPlacement
    ) as StartPlacementData;
  }

  return {
    ...sequence,
    steps: beatsWithPositions,
    ...(updatedStartPlacement !== undefined &&
      updatedStartPlacement !== null && {
        startPlacement: updatedStartPlacement,
      }),
    ...(updatedStartingPlacementStep !== undefined && {
      startingPlacement: updatedStartingPlacementStep,
    }),
  };
}

function derivePositionsForBeat(
  beat: StepData | StartPlacementData
): StepData | StartPlacementData {
  // Skip if positions are already set or if motions are missing
  if (
    (beat.startPlacement !== null && beat.endPlacement !== null) ||
    !beat.motions.left ||
    !beat.motions.right
  ) {
    return beat;
  }

  try {
    // Calculate start position from starting hand locations
    const startPlacement: GridPlacement = getGridPlacementFromLocations(
      beat.motions.left.startLocation,
      beat.motions.right.startLocation
    );

    // Calculate end position from ending hand locations
    const endPlacement: GridPlacement = getGridPlacementFromLocations(
      beat.motions.left.endLocation,
      beat.motions.right.endLocation
    );

    return {
      ...beat,
      startPlacement,
      endPlacement,
    };
  } catch (error) {
    // Use appropriate identifier in warning
    const identifier =
      "stepNumber" in beat ? `beat ${beat.stepNumber}` : "start position";
    console.warn(`Failed to derive positions for ${identifier}:`, error);
    return beat;
  }
}
