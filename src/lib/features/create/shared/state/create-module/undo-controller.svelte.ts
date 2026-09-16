/**
 * Undo Controller
 *
 * Wraps the undo service so the create module state can stay declarative.
 * Handles snapshotting, callbacks, and the animation-friendly undo flow.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type { UndoManager } from "../../services/undo-manager";
import type { UndoMetadata } from "../../services/undo-manager";
import { UndoOperationType } from "../../services/undo-manager";
import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  createHistoryTransitionPlan,
  type HistoryDirection,
} from "../../services/history-transition-planner";

type UndoControllerDeps = {
  UndoManager: UndoManager;
  sequenceState: SequenceState;
  getActiveSection: () => BuildModeId;
  setActiveSectionInternal: (
    panel: BuildModeId,
    addToHistory?: boolean
  ) => Promise<void>;
};

/**
 * Subset of UndoOperationType used for snapshot operations
 * @deprecated Use UndoOperationType directly
 */
export type UndoSnapshotType = UndoOperationType;

export function createUndoController({
  UndoManager,
  sequenceState,
  getActiveSection,
  setActiveSectionInternal,
}: UndoControllerDeps) {
  let showStartPlacementPickerCallback: (() => void) | null = null;
  let syncPickerStateCallback: (() => void) | null = null;

  let undoChangeCounter = $state(0);
  let historySuspended = $state(false);

  UndoManager.onChange(() => {
    undoChangeCounter++;
  });

  function pushUndoSnapshot(type: UndoOperationType, metadata?: UndoMetadata) {
    if (historySuspended) {
      return;
    }

    if (
      !sequenceState.currentSequence &&
      type !== UndoOperationType.SELECT_START_PLACEMENT
    ) {
      return;
    }

    const currentSequenceRef = sequenceState.currentSequence;
    const selectedStepNumberRef = sequenceState.selectedStepNumber;
    const activeSectionRef = getActiveSection();
    const timestampRef = Date.now();

    queueMicrotask(() => {
      const sequenceCopy: SequenceData | null = currentSequenceRef
        ? {
            ...currentSequenceRef,
            steps: currentSequenceRef.steps.map((step) =>
              step ? { ...step } : step
            ),
          }
        : null;

      const beforeState = {
        sequence: sequenceCopy,
        selectedStepNumber: selectedStepNumberRef,
        activeSection: activeSectionRef,
        shouldShowStartPlacementPicker:
          type === UndoOperationType.SELECT_START_PLACEMENT,
        timestamp: timestampRef,
      };

      UndoManager.pushUndo(type, beforeState, metadata);
    });
  }

  function captureCurrentState(activeSection: BuildModeId) {
    const currentSequence = sequenceState.currentSequence;

    return {
      sequence: currentSequence
        ? {
            ...currentSequence,
            steps: currentSequence.steps.map((step) =>
              step ? { ...step } : step
            ),
          }
        : null,
      selectedStepNumber: sequenceState.selectedStepNumber,
      activeSection,
      timestamp: Date.now(),
    };
  }

  function beginHistoryTransition(
    direction: HistoryDirection,
    type: UndoOperationType,
    label: string,
    fromState: ReturnType<typeof captureCurrentState>,
    toState: {
      sequence: SequenceData | null;
      selectedStepNumber: number | null;
    }
  ) {
    sequenceState.animationState.startHistoryTransition(
      createHistoryTransitionPlan({
        direction,
        operation: type,
        label,
        fromSequence: fromState.sequence,
        toSequence: toState.sequence,
        fromSelectedStepNumber: fromState.selectedStepNumber,
        toSelectedStepNumber: toState.selectedStepNumber,
      })
    );
  }

  function undo(): boolean {
    if (historySuspended) {
      return false;
    }

    const currentSection = getActiveSection();
    const currentState = captureCurrentState(currentSection);

    // Only undo entries from the current tab
    const lastEntry = UndoManager.undo(currentSection, currentState);
    if (!lastEntry) {
      return false;
    }

    const undoDescription =
      lastEntry.metadata?.description ||
      UndoManager.getOperationDescription(lastEntry.type);

    // Show brief toast confirming the undo
    if (undoDescription) {
      toast.info(`Undid ${undoDescription}`, 1500);
    }

    beginHistoryTransition(
      "undo",
      lastEntry.type,
      undoDescription,
      currentState,
      lastEntry.beforeState
    );

    if (lastEntry.type === UndoOperationType.SELECT_START_PLACEMENT) {
      void sequenceState.clearSequenceCompletely();
      if (showStartPlacementPickerCallback) {
        showStartPlacementPickerCallback();
      }
      return true;
    }

    // Restore the sequence directly
    sequenceState.setCurrentSequence(lastEntry.beforeState.sequence);
    restoreSelection(lastEntry.beforeState.selectedStepNumber);
    if (lastEntry.beforeState.activeSection) {
      void setActiveSectionInternal(lastEntry.beforeState.activeSection, false);
    }

    if (syncPickerStateCallback) {
      syncPickerStateCallback();
    }

    return true;
  }

  function restoreSelection(selectedStepNumber: number | null) {
    if (selectedStepNumber !== null) {
      sequenceState.selectStep(selectedStepNumber);
    } else {
      sequenceState.clearSelection();
    }
  }

  function redo(): boolean {
    if (historySuspended) {
      return false;
    }

    const currentSection = getActiveSection();
    const currentState = captureCurrentState(currentSection);
    const nextEntry = UndoManager.getLastRedoEntry(currentSection);
    if (!nextEntry?.afterState) {
      return false;
    }
    const afterState = nextEntry.afterState;

    const entry = UndoManager.redo(currentSection);
    if (!entry) {
      return false;
    }

    const redoDescription =
      entry.metadata?.description ||
      UndoManager.getOperationDescription(entry.type);
    beginHistoryTransition(
      "redo",
      entry.type,
      redoDescription,
      currentState,
      afterState
    );

    // Restore the sequence from the after state
    sequenceState.setCurrentSequence(afterState.sequence);
    restoreSelection(afterState.selectedStepNumber);

    if (syncPickerStateCallback) {
      syncPickerStateCallback();
    }

    if (redoDescription) {
      toast.info(`Redid ${redoDescription}`, 1500);
    }

    return true;
  }

  function clearUndoHistory() {
    if (historySuspended) {
      return;
    }

    UndoManager.clearHistory();
  }

  function suspendHistory(): void {
    historySuspended = true;
  }

  function resumeHistory(): void {
    historySuspended = false;
  }

  function setShowStartPlacementPickerCallback(callback: () => void) {
    showStartPlacementPickerCallback = callback;
  }

  function setSyncPickerStateCallback(callback: () => void) {
    syncPickerStateCallback = callback;
  }

  /**
   * Jump to a specific history entry and restore that state
   * Used by history panel to allow jumping to any point in history
   */
  function jumpToState(entryId: string): boolean {
    if (historySuspended) {
      return false;
    }

    // Get timeline to find the entry
    const timeline = UndoManager.getTimeline();
    const entry = timeline.find((e) => e.id === entryId);
    if (!entry) return false;
    const currentState = captureCurrentState(getActiveSection());

    // Perform the jump in the manager
    const result = UndoManager.jumpToState(entryId);
    if (!result) return false;

    const description =
      entry.metadata?.description ||
      UndoManager.getOperationDescription(entry.type);
    beginHistoryTransition(
      "jump",
      entry.type,
      description,
      currentState,
      entry.beforeState
    );

    // Restore the state from the entry's beforeState
    if (entry.type === UndoOperationType.SELECT_START_PLACEMENT) {
      void sequenceState.clearSequenceCompletely();
      if (showStartPlacementPickerCallback) {
        showStartPlacementPickerCallback();
      }
    } else {
      sequenceState.setCurrentSequence(entry.beforeState.sequence);
      restoreSelection(entry.beforeState.selectedStepNumber);
      if (entry.beforeState.activeSection) {
        void setActiveSectionInternal(entry.beforeState.activeSection, false);
      }
    }

    if (syncPickerStateCallback) {
      syncPickerStateCallback();
    }

    // Show toast indicating the jump
    toast.info(`Jumped to: ${description}`, 1500);

    return true;
  }

  return {
    pushUndoSnapshot,
    undo,
    redo,
    clearUndoHistory,
    suspendHistory,
    resumeHistory,
    jumpToState,
    setShowStartPlacementPickerCallback,
    setSyncPickerStateCallback,
    get canUndo() {
      void undoChangeCounter;
      return (
        !historySuspended && UndoManager.canUndoForSection(getActiveSection())
      );
    },
    get canRedo() {
      void undoChangeCounter;
      return Boolean(
        !historySuspended &&
        UndoManager.getLastRedoEntry(getActiveSection())?.afterState
      );
    },
    get undoHistory() {
      return historySuspended ? [] : UndoManager.undoHistory;
    },
    get redoHistory() {
      return historySuspended ? [] : UndoManager.redoHistory;
    },
    get nextUndoEntry() {
      void undoChangeCounter;
      return historySuspended
        ? null
        : UndoManager.getLastUndoEntry(getActiveSection());
    },
    get nextRedoEntry() {
      void undoChangeCounter;
      if (historySuspended) return null;

      const entry = UndoManager.getLastRedoEntry(getActiveSection());
      return entry?.afterState ? entry : null;
    },
    getTimeline() {
      void undoChangeCounter;
      return historySuspended ? [] : UndoManager.getTimeline();
    },
    getOperationDescription(type: UndoOperationType) {
      return UndoManager.getOperationDescription(type);
    },
  };
}

export type UndoController = ReturnType<typeof createUndoController>;
