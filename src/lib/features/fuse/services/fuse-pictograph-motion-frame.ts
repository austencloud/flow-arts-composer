import { calculateBeatState } from "$lib/shared/animation-engine/services/step-calculator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

export interface FusePictographMotionFrame {
  step: StepData;
  stepIndex: number;
  motionStartData: PictographData;
  motionProgress: number;
}

/**
 * Map Fuse's zero-based loop clock onto the pictograph renderer's motion seam.
 * The same target step and fractional progress feed the animation engine in the
 * combined preview, while the preceding pictograph supplies exact SVG start
 * coordinates for the source-card rendering.
 */
export function resolveFusePictographMotionFrame(
  sequence: SequenceData | null,
  currentStep: number
): FusePictographMotionFrame | null {
  const steps = sequence?.steps ?? [];
  const stepCount = steps.length;
  if (!sequence || stepCount === 0) return null;

  const safeStep = Number.isFinite(currentStep) ? currentStep : 0;
  const wrappedStep = ((safeStep % stepCount) + stepCount) % stepCount;
  const frame = calculateBeatState(wrappedStep, steps, stepCount);
  if (!frame.isValid) return null;

  const previousStepIndex =
    (frame.currentStepIndex - 1 + stepCount) % stepCount;
  const motionStartData =
    frame.currentStepIndex === 0
      ? (sequence.startPlacement ??
        sequence.startingPlacement ??
        steps[previousStepIndex])
      : steps[previousStepIndex];

  if (!motionStartData) return null;

  return {
    step: frame.currentStepData,
    stepIndex: frame.currentStepIndex,
    motionStartData,
    motionProgress: frame.stepProgress,
  };
}
