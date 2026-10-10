/**
 * Sequence Step Operations
 *
 * Handles step-level operations with animation support:
 * - Adding/removing steps
 * - Updating step data
 * - Step insertion
 * - Animated step removal
 *
 * RESPONSIBILITY: Step operations coordinator, orchestrates state + services
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { SequenceAnimationState } from "../animation/sequence-animation-state.svelte";
import type { SequenceCoreState } from "../core/sequence-core-state.svelte";
import type { SequenceSelectionState } from "../selection/sequence-selection-state.svelte";
import type { ReversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import {
  withLoopCertificateCleared,
  invalidateLoopDisplayCache,
} from "#lib/shared/create/services/loop-certificate.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

/**
 * How long a leaving cell recedes before the grid takes its new step list.
 * Must match the `.step-container.deleting` animation in WorkspaceGrid, which
 * runs on `--duration-normal`.
 */
const STEP_EXIT_ANIMATION_MS = DURATION.normal;

export interface StepOperationsConfig {
  coreState: SequenceCoreState;
  selectionState: SequenceSelectionState;
  animationState: SequenceAnimationState;
  ReversalDetector?: ReversalDetector;
  onError?: (error: string) => void;
  onSave?: () => Promise<void>;
}

export function createSequenceStepOperations(config: StepOperationsConfig) {
  const {
    coreState,
    selectionState,
    animationState,
    ReversalDetector,
    onError,
    onSave,
  } = config;

  // Helper functions for in-memory sequence manipulation
  function addStepToSequence(
    sequence: SequenceData,
    stepData?: Partial<StepData>
  ): SequenceData {
    const newStep: StepData = createStepData({
      isBlank: true,
      ...(stepData ?? {}),
      stepNumber: stepData?.stepNumber ?? sequence.steps.length + 1,
    });
    return { ...sequence, steps: [...sequence.steps, newStep] };
  }

  function removeStepFromSequence(
    sequence: SequenceData,
    stepIndex: number
  ): SequenceData {
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
      return sequence;
    }
    const newSteps = sequence.steps.filter((_, index) => index !== stepIndex);
    return { ...sequence, steps: newSteps };
  }

  function removeStepAndSubsequentFromSequence(
    sequence: SequenceData,
    stepIndex: number
  ): SequenceData {
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
      return sequence;
    }
    const newSteps = sequence.steps.slice(0, stepIndex);
    return { ...sequence, steps: newSteps };
  }

  function updateStepInSequence(
    sequence: SequenceData,
    stepIndex: number,
    stepData: Partial<StepData>
  ): SequenceData {
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
      return sequence;
    }
    const newSteps = [...sequence.steps];
    newSteps[stepIndex] = { ...newSteps[stepIndex], ...stepData } as StepData;
    return { ...sequence, steps: newSteps };
  }

  function insertStepInSequence(
    sequence: SequenceData,
    stepIndex: number,
    stepData: Partial<StepData>
  ): SequenceData {
    const newStep: StepData = createStepData({
      isBlank: true,
      ...stepData,
      stepNumber: stepData.stepNumber ?? stepIndex + 1,
    });
    const newSteps = [
      ...sequence.steps.slice(0, stepIndex),
      newStep,
      ...sequence.steps.slice(stepIndex),
    ];
    return { ...sequence, steps: newSteps };
  }

  function clearSequenceBeats(sequence: SequenceData): SequenceData {
    return { ...sequence, steps: [] };
  }

  function getSelectedBeat(
    sequence: SequenceData,
    index: number
  ): StepData | null {
    if (index < 0 || index >= sequence.steps.length) {
      return null;
    }
    return sequence.steps[index] ?? null;
  }

  function handleError(message: string, error?: unknown) {
    const errorMsg = error instanceof Error ? error.message : message;
    coreState.setError(errorMsg);
    onError?.(errorMsg);
    console.error(message, error);
  }

  return {
    addStep(stepData?: Partial<StepData>) {
      if (!coreState.currentSequence) return;

      try {
        let updatedSequence = addStepToSequence(
          coreState.currentSequence,
          stepData
        );
        // Process reversals to ensure correct reversal indicators
        if (ReversalDetector) {
          updatedSequence = ReversalDetector.processReversals(updatedSequence);
        }
        coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
        invalidateLoopDisplayCache();
        coreState.clearError();
      } catch (error) {
        handleError("Failed to add beat", error);
      }
    },

    removeStep(stepIndex: number) {
      if (!coreState.currentSequence) return;

      try {
        let updatedSequence = removeStepFromSequence(
          coreState.currentSequence,
          stepIndex
        );
        // Process reversals to ensure correct reversal indicators
        if (ReversalDetector) {
          updatedSequence = ReversalDetector.processReversals(updatedSequence);
        }
        coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
        invalidateLoopDisplayCache();
        selectionState.adjustSelectionForRemovedStep(stepIndex);
        coreState.clearError();
        onSave?.().catch((err) =>
          console.error("Failed to auto-save after beat removal:", err)
        );
      } catch (error) {
        handleError("Failed to remove beat", error);
      }
    },

    removeStepWithAnimation(stepIndex: number, onComplete?: () => void) {
      if (!coreState.currentSequence) return;

      animationState.startRemovingBeat(stepIndex);

      // Let the cell finish receding, then hand the grid its new step list. The
      // grid's own layout transition carries the survivors from there, so this
      // must not hold the removing flag past the mutation.
      setTimeout(() => {
        try {
          if (!coreState.currentSequence) return;

          let updatedSequence = removeStepFromSequence(
            coreState.currentSequence,
            stepIndex
          );
          // Process reversals to ensure correct reversal indicators
          if (ReversalDetector) {
            updatedSequence =
              ReversalDetector.processReversals(updatedSequence);
          }
          animationState.endRemovingBeat();
          coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
          invalidateLoopDisplayCache();
          selectionState.adjustSelectionForRemovedStep(stepIndex);
          coreState.clearError();
          onSave?.().catch((err) =>
            console.error("Failed to auto-save after beat removal:", err)
          );
          onComplete?.();
        } catch (error) {
          handleError("Failed to remove beat", error);
          animationState.endRemovingBeat();
        }
      }, STEP_EXIT_ANIMATION_MS);
    },

    removeStepAndSubsequent(stepIndex: number) {
      if (!coreState.currentSequence) return;

      try {
        let updatedSequence = removeStepAndSubsequentFromSequence(
          coreState.currentSequence,
          stepIndex
        );
        // Process reversals to ensure correct reversal indicators
        if (ReversalDetector) {
          updatedSequence = ReversalDetector.processReversals(updatedSequence);
        }
        coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
        invalidateLoopDisplayCache();
        selectionState.clearSelection();
        coreState.clearError();
        onSave?.().catch((err) =>
          console.error("Failed to auto-save after beat removal:", err)
        );
      } catch (error) {
        handleError("Failed to remove beat and subsequent steps", error);
      }
    },

    removeStepAndSubsequentWithAnimation(
      stepIndex: number,
      onComplete?: () => void
    ) {
      if (!coreState.currentSequence) return;

      const _stepsToRemove = coreState.currentSequence.steps.length - stepIndex;
      const removingIndices: number[] = [];
      for (let i = stepIndex; i < coreState.currentSequence.steps.length; i++) {
        removingIndices.push(i);
      }

      // Add ALL steps to removing set at once - they all fade simultaneously
      animationState.startRemovingBeats(removingIndices);

      // Remove steps after fade animation completes
      setTimeout(() => {
        try {
          if (!coreState.currentSequence) return;

          let updatedSequence = removeStepAndSubsequentFromSequence(
            coreState.currentSequence,
            stepIndex
          );
          // Process reversals to ensure correct reversal indicators
          if (ReversalDetector) {
            updatedSequence =
              ReversalDetector.processReversals(updatedSequence);
          }
          animationState.endRemovingBeats();
          coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
          invalidateLoopDisplayCache();
          // NOTE: Don't clear selection here - the onComplete callback will select the appropriate next beat
          // This prevents the mobile Beat Editor controls from disappearing during the animation
          coreState.clearError();
          onSave?.().catch((err) =>
            console.error("Failed to auto-save after beat removal:", err)
          );
          onComplete?.();
        } catch (error) {
          handleError("Failed to remove beat and subsequent steps", error);
          animationState.endRemovingBeats();
        }
      }, STEP_EXIT_ANIMATION_MS);
    },

    updateStep(stepIndex: number, stepData: Partial<StepData>) {
      if (!coreState.currentSequence) return;

      try {
        let updatedSequence = updateStepInSequence(
          coreState.currentSequence,
          stepIndex,
          stepData
        );
        // Process reversals to ensure correct reversal indicators
        if (ReversalDetector) {
          updatedSequence = ReversalDetector.processReversals(updatedSequence);
        }
        coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
        invalidateLoopDisplayCache();
        coreState.clearError();
      } catch (error) {
        handleError("Failed to update beat", error);
      }
    },

    insertStep(stepIndex: number, stepData?: Partial<StepData>) {
      if (!coreState.currentSequence) return;

      try {
        let updatedSequence = insertStepInSequence(
          coreState.currentSequence,
          stepIndex,
          stepData ?? {}
        );
        // Process reversals to ensure correct reversal indicators
        if (ReversalDetector) {
          updatedSequence = ReversalDetector.processReversals(updatedSequence);
        }
        coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
        invalidateLoopDisplayCache();
        selectionState.adjustSelectionForInsertedStep(stepIndex);
        coreState.clearError();
      } catch (error) {
        handleError("Failed to insert beat", error);
      }
    },

    clearSequence() {
      if (!coreState.currentSequence) return;

      try {
        const updatedSequence = clearSequenceBeats(coreState.currentSequence);
        coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence));
        invalidateLoopDisplayCache();
        selectionState.clearSelection();
        coreState.clearError();
      } catch (error) {
        handleError("Failed to clear sequence", error);
      }
    },

    getStep(index: number): StepData | null {
      if (!coreState.currentSequence) return null;
      return getSelectedBeat(coreState.currentSequence, index);
    },

    getStepCount(): number {
      return coreState.currentSequence?.steps?.length ?? 0;
    },

    hasContent(): boolean {
      return coreState.currentSequence?.steps?.some((b) => !b.isBlank) ?? false;
    },
  };
}

export type SequenceStepOperations = ReturnType<
  typeof createSequenceStepOperations
>;
