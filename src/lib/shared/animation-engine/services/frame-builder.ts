import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  glyphTurnsTuple,
  NO_TURNS_TUPLE,
} from "$lib/shared/animation-engine/domain/glyph-turns-tuple";

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

  calculateTurnsTuple(
    stepData: StartPlacementData | StepData | null,
    turnsTupleGenerator: { generateTurnsTuple(step: PictographData): string } | null
  ): string {
    // Untrusted data can hand over a non-object step; it has no turns.
    if (!turnsTupleGenerator || !stepData || typeof stepData !== "object") {
      return NO_TURNS_TUPLE;
    }
    return glyphTurnsTuple(stepData, turnsTupleGenerator) ?? NO_TURNS_TUPLE;
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
