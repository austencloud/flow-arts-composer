import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class FrameBuilder {
  calculateBeatNumber(
    sequenceData: SequenceData | null,
    stepData: StartPlacementData | StepData | null
  ): number {
    if (!sequenceData || !stepData) return 0;
    const stepIndex = sequenceData.steps?.findIndex((b) => b === stepData);
    if (stepIndex !== undefined && stepIndex >= 0) {
      return stepIndex + 1;
    }
    return 0;
  }

  calculateMusicalPosition(
    sequenceData: SequenceData | null,
    stepData: StartPlacementData | StepData | null,
    orchestrator: { isInitialized(): boolean; getContinuousMusicalPosition(): number } | null
  ): string | null {
    if (orchestrator?.isInitialized()) {
      const continuousPosition = orchestrator.getContinuousMusicalPosition();
      if (continuousPosition <= 0) return null;
      return continuousPosition.toFixed(1);
    }

    if (stepData && sequenceData) {
      const stepIndex = sequenceData.steps?.findIndex((b) => b === stepData);
      if (stepIndex !== undefined && stepIndex >= 0) {
        return `${stepIndex + 1}.0`;
      }
    }

    return null;
  }
}
