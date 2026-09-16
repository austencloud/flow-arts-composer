/**
 * Structural type interfaces for CreateModuleState and ConstructTabState.
 *
 * These exist so that shared/ consumers can reference the shape of the
 * feature-level state without importing from features/create directly.
 * The actual implementations in features/create satisfy these interfaces.
 */

import type { UndoOperationType } from "$lib/shared/create/domain/undo-operation-types";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

/**
 * SequenceState interface covering what shared/ consumers access.
 * Includes methods used by clearSequenceWorkflow and register-create-shortcuts.
 */
export type TargetHand = "left" | "right" | "both";

export interface SequenceStateMinimal {
  readonly currentSequence: SequenceData | null;
  readonly selectedStepData: StepData | null;
  clearPersistedState(): Promise<void>;
  setCurrentSequence(sequence: SequenceData | null): void;
  clearSelection(): void;
  clearError(): void;
  clearSequence(): void;
  clearSequenceCompletely(): Promise<void>;
  hasSequence(): boolean;
  getSelectedStepIndex(): number | null;
  removeStepAndSubsequentWithAnimation(
    stepIndex: number,
    onComplete?: () => void
  ): void;
  selectStep(stepIndex: number): void;
  selectStartPlacementForEditing(): void;
  mirrorSequence(targetHand?: TargetHand): Promise<void>;
  flipSequence(targetHand?: TargetHand): Promise<void>;
  swapHands(): Promise<void>;
  invertSequence(targetHand?: TargetHand): Promise<void>;
  rewindSequence(targetHand?: TargetHand): Promise<void>;
  rotateSequence(
    direction: "clockwise" | "counterclockwise",
    targetHand?: TargetHand,
    rotationSteps?: number
  ): Promise<void>;
  shiftStartPlacement(stepNumber: number): Promise<void>;
}

/**
 * Interface for CreateModuleState as consumed by shared/ utilities.
 * Covers: create-module-state-ref, clearSequenceWorkflow, register-create-shortcuts
 */
export interface CreateModuleState {
  readonly sequenceState: SequenceStateMinimal;
  getActiveTabSequenceState(): SequenceStateMinimal;
  pushUndoSnapshot(
    type: UndoOperationType,
    metadata?: { description?: string }
  ): void;
  undo(): boolean;
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly assembleTabState: {
    readonly assembleBuilderState: {
      reset(): void;
    };
  } | null;
}

/**
 * Minimal interface for ConstructTabState as consumed by shared/ utilities.
 * Covers: clearSequenceWorkflow
 */
export interface ConstructTabState {
  setShowStartPlacementPicker(show: boolean): void;
  setSelectedStartPlacement(placement: PictographData | null): void;
  readonly startPlacementStateService: {
    clearSelectedPlacement(): void;
  };
  clearError(): void;
}
