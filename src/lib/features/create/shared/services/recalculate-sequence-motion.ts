import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  updateEndOrientations,
  updateStartOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";

/**
 * Rebuild orientation-dependent motion data from one changed beat onward, then
 * derive every reversal flag from the resulting sequence.
 */
export function recalculateSequenceMotionFrom(
  sequence: SequenceData,
  startIndex: number
): SequenceData {
  const steps: StepData[] = [...sequence.steps];

  for (let index = startIndex; index < steps.length; index += 1) {
    let step = steps[index]!;
    const previous =
      index === 0
        ? sequence.startingPlacement ?? sequence.startPlacement ?? null
        : steps[index - 1] ?? null;

    if (previous && !step.isBlank) {
      step = updateStartOrientations(step, previous);
    }
    if (!step.isBlank) {
      step = updateEndOrientations(step);
    }

    steps[index] = step;
  }

  return reversalDetector.processReversals({
    ...sequence,
    steps,
  });
}
