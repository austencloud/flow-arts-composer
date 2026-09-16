import { closeOrientationCycle } from "@tka/sequence-engine/loop";
import type {
  Orientation as EngineOrientation,
  SequenceStep,
} from "@tka/sequence-engine";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function resolveStartOrientations(sequence: SequenceData): {
  left: EngineOrientation;
  right: EngineOrientation;
} {
  const startPlacement = sequence.startPlacement ?? sequence.startingPlacement;
  return {
    left: (startPlacement?.motions?.left?.startOrientation ??
      sequence.steps[0]?.motions.left?.startOrientation ??
      "in") as EngineOrientation,
    right: (startPlacement?.motions?.right?.startOrientation ??
      sequence.steps[0]?.motions.right?.startOrientation ??
      "in") as EngineOrientation,
  };
}

export function getSequenceOrientationCycleCount(
  sequence: SequenceData
): 1 | 2 | 4 | 8 {
  if (!sequence.steps.length) return 1;

  return closeOrientationCycle(
    sequence.steps as unknown as readonly SequenceStep[],
    { startOrientations: resolveStartOrientations(sequence) }
  ).orientationCycleCount;
}

export function closeSequenceOrientationCycle(
  sequence: SequenceData
): SequenceData {
  const result = closeOrientationCycle(
    sequence.steps as unknown as readonly SequenceStep[],
    { startOrientations: resolveStartOrientations(sequence) }
  );

  if (result.orientationCycleCount === 1) {
    return updateSequenceData(sequence, { orientationCycleCount: 1 });
  }

  // A placement loop can return home while the prop still points somewhere
  // else. Repeating the complete path lets the viewer see the whole flower
  // and removes the jump that would otherwise happen at playback's seam.
  return updateSequenceData(sequence, {
    steps: result.steps as unknown as StepData[],
    word: sequence.word.repeat(result.orientationCycleCount),
    orientationCycleCount: result.orientationCycleCount,
  });
}
