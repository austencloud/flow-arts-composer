/**
 * SequenceData adapter for the sequence engine's orientation-cycle analysis.
 *
 * Orientation math belongs to @tka/sequence-engine. This module only reads the
 * app's separately stored start placement and converts the result to app enums.
 */

import { analyzeOrientationCycle } from "@tka/sequence-engine/loop";
import type {
  Orientation as EngineOrientation,
  SequenceStep,
} from "@tka/sequence-engine";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { Step } from "@tka/tka-types";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";

export interface OrientationCycleResult {
  cycleCount: 1 | 2 | 4 | 8;
  leftOrientations: Orientation[];
  rightOrientations: Orientation[];
}

export function detectOrientationCycle(
  sequence: SequenceData
): OrientationCycleResult {
  const start = getStartingOrientations(sequence);
  // SequenceData's StepData adds app-only reversal fields to the engine shape.
  const result = analyzeOrientationCycle(
    sequence.steps as unknown as readonly SequenceStep[],
    {
    startOrientations: {
      left: start.left as EngineOrientation,
      right: start.right as EngineOrientation,
    },
    }
  );

  return {
    cycleCount: result.cycleCount,
    leftOrientations: result.leftOrientations as Orientation[],
    rightOrientations: result.rightOrientations as Orientation[],
  };
}

function getStartingOrientations(sequence: SequenceData): {
  left: Orientation;
  right: Orientation;
} {
  const startPlacement = sequence.startPlacement || sequence.startingPlacement;

  if (startPlacement && isStartPlacementData(startPlacement)) {
    return {
      left:
        startPlacement.motions?.left?.startOrientation ?? Orientation.IN,
      right:
        startPlacement.motions?.right?.startOrientation ?? Orientation.IN,
    };
  }

  const firstStep = sequence.steps[0];
  return {
    left: firstStep?.motions.left?.startOrientation ?? Orientation.IN,
    right: firstStep?.motions.right?.startOrientation ?? Orientation.IN,
  };
}

function isStartPlacementData(
  data: StartPlacementData | Step
): data is StartPlacementData {
  return "isStartPlacement" in data && data.isStartPlacement === true;
}
