import type { ReversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import { reversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import { withLoopCertificateCleared } from "#lib/shared/create/services/loop-certificate.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  updateEndOrientations,
  updateStartOrientations,
} from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

export interface BuiltAppendedOption {
  readonly sequence: SequenceData;
  readonly step: StepData;
  readonly stepNumber: number;
}

interface BuildOptionApplicationOptions {
  reversalDetector?: ReversalDetector | null;
  onRecoverableError?: (
    stage: "reversal" | "orientation",
    error: unknown
  ) => void;
}

/**
 * Builds the exact append a tap would commit without mutating application
 * state. Transient auditions and committed selections share this path so their
 * reversal and orientation results cannot diverge.
 */
export function buildAppendedOptionSequence(
  currentSequence: SequenceData,
  option: PictographData,
  {
    reversalDetector: detector = reversalDetector,
    onRecoverableError = () => {},
  }: BuildOptionApplicationOptions = {}
): BuiltAppendedOption {
  const stepNumber = currentSequence.steps.length + 1;
  let reversalInfo = { leftReversal: false, rightReversal: false };

  if (detector && currentSequence.steps.length > 0) {
    try {
      reversalInfo = detector.detectReversalForOption(
        [...currentSequence.steps],
        option
      );
    } catch (error) {
      onRecoverableError("reversal", error);
    }
  }

  let step = createStepData({
    ...option,
    stepNumber,
    isBlank: false,
    leftReversal: reversalInfo.leftReversal,
    rightReversal: reversalInfo.rightReversal,
  });

  const previousStep = currentSequence.steps.at(-1);
  if (previousStep && !previousStep.isBlank && !step.isBlank) {
    try {
      step = updateStartOrientations(step, previousStep);
      step = updateEndOrientations(step);
    } catch (error) {
      onRecoverableError("orientation", error);
    }
  }

  return {
    sequence: withLoopCertificateCleared({
      ...currentSequence,
      steps: [...currentSequence.steps, step],
    }),
    step,
    stepNumber,
  };
}
