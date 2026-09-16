/**
 * Auto Edit Panel Manager
 *
 * Handles automatic opening of edit panel when multiple steps are selected.
 * Consolidates multi-select edit panel logic from CreateModule.svelte.
 *
 * Domain: Create module - Edit Panel Automation
 */

import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  hasStepEditorSelection,
  sequenceHasStepEditorContent,
} from "../../services/step-editor-availability";
import type { PanelCoordinationState } from "../panel-coordination-state.svelte";
import type { createCreateModuleState as CreateModuleStateType } from "../create-module-state.svelte";

type CreateModuleState = ReturnType<typeof CreateModuleStateType>;

// Lazy logger initialization to avoid circular dependency issues
let logger: ReturnType<typeof createComponentLogger> | null = null;
const getLogger = () => {
  if (!logger) {
    logger = createComponentLogger("AutoEditPanelManager");
  }
  return logger;
};

const START_PLACEMENT_BEAT_NUMBER = 0;

export interface AutoEditPanelConfig {
  CreateModuleState: CreateModuleState;
  panelState: PanelCoordinationState;
  /** Optional: Direct getter for selectedStepNumber to ensure reactivity */
  getSelectedStepNumber?: () => number | null;
  /** Construct keeps selection in the live option workflow instead of opening a drawer. */
  shouldAutoOpen?: () => boolean;
}

/**
 * Creates auto-open edit panel effect for multi-select
 * @returns Cleanup function
 */
export function createAutoEditPanelEffect(
  config: AutoEditPanelConfig
): () => void {
  const { CreateModuleState, panelState } = config;

  return $effect.root(() => {
    $effect(() => {
      const sequenceState = CreateModuleState.getActiveTabSequenceState();
      const selectedStepNumbers = sequenceState.selectedStepNumbers;
      const selectedCount = selectedStepNumbers.size ?? 0;
      const shouldAutoOpen = config.shouldAutoOpen?.() ?? true;

      if (
        sequenceHasStepEditorContent(sequenceState.currentSequence) &&
        shouldAutoOpen &&
        selectedCount > 1 &&
        !panelState.isStepEditorPanelOpen
      ) {
        // Map beat numbers to step data
        const stepNumbersArray = Array.from(selectedStepNumbers).sort(
          (a, b) => a - b
        );
        const stepsData = stepNumbersArray
          .map((stepNumber) => {
            if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
              // Beat 0 is the start placement
              return sequenceState.selectedStartPlacement;
            } else {
              // Steps are numbered 1, 2, 3... but stored in array at indices 0, 1, 2...
              const stepIndex = stepNumber - 1;
              return sequenceState.currentSequence?.steps[stepIndex];
            }
          })
          .filter(
            (beat): beat is StepData => beat !== null && beat !== undefined
          ); // Remove any null/undefined values

        getLogger().log(
          `Auto-opening batch edit panel: ${selectedCount} steps selected`
        );
        panelState.openBatchEditPanel(stepsData);
      }
    });
  });
}

/**
 * Creates auto-open effect for Beat Editor panel on beat selection
 *
 * Keeps a restored panel flag synchronized with the hydrated selection. The
 * shared mandala drawer is allowed without a step; the editor branch is not.
 *
 * @returns Cleanup function
 */
export function createAutoStepEditorEffect(
  config: AutoEditPanelConfig
): () => void {
  const { CreateModuleState, panelState } = config;

  let lastSelectedBeat: number | null = null;

  return $effect.root(() => {
    $effect(() => {
      // Get the sequence state fresh each time
      const seqState = CreateModuleState.getActiveTabSequenceState();
      const currentSequence = seqState.currentSequence;
      const selectedStepNumber = seqState.selectedStepNumber;
      const shouldAutoOpen = config.shouldAutoOpen?.() ?? true;

      if (!sequenceHasStepEditorContent(currentSequence)) {
        lastSelectedBeat = null;

        // Persistence restores the editor flag and step selection separately.
        // Wait until sequence hydration finishes before deciding they are stale,
        // otherwise a valid saved workspace could lose its editor while loading.
        if (CreateModuleState.isPersistenceInitialized) {
          if (panelState.isStepEditorPanelOpen) {
            panelState.closeStepEditorPanel();
          }

          if (seqState.isMultiSelectMode) {
            seqState.exitMultiSelectMode();
          } else if (selectedStepNumber !== null) {
            seqState.clearSelection();
          }
        }
        return;
      }

      const canShowEditor = hasStepEditorSelection({
        sequence: currentSequence,
        selectedStepNumber,
        selectedStepNumbers: seqState.selectedStepNumbers,
        hasMandalaSelection: panelState.mandalaViewerSelection !== null,
      });

      // Panel and selection persistence hydrate independently. Keep the
      // restored flag only when there is still something selected to edit.
      if (!canShowEditor) {
        lastSelectedBeat = null;
        if (
          CreateModuleState.isPersistenceInitialized &&
          panelState.isStepEditorPanelOpen
        ) {
          panelState.closeStepEditorPanel();
        }
        return;
      }

      if (!shouldAutoOpen) {
        lastSelectedBeat = selectedStepNumber;
        return;
      }

      // Only act when selection CHANGES (prevents fight with manual close)
      if (selectedStepNumber !== lastSelectedBeat) {
        if (selectedStepNumber !== null) {
          // New beat selected → auto-open Beat Editor panel
          panelState.openStepEditorPanel();
          getLogger().log(
            `Auto-opening Beat Editor panel for beat ${selectedStepNumber}`
          );
        }
        lastSelectedBeat = selectedStepNumber;
      }
    });
  });
}

/**
 * @deprecated Use createAutoStepEditorEffect instead
 * Kept for backward compatibility during migration
 */
export function createAutoSequenceActionsEffect(
  config: AutoEditPanelConfig
): () => void {
  getLogger().warn(
    "createAutoSequenceActionsEffect is deprecated. Use createAutoStepEditorEffect instead."
  );
  return createAutoStepEditorEffect(config);
}

/**
 * Deprecated: Use createAutoSequenceActionsEffect instead
 * Kept for backward compatibility during migration
 * @deprecated
 */
export function createSingleBeatEditEffect(
  config: AutoEditPanelConfig
): () => void {
  getLogger().warn(
    "createSingleBeatEditEffect is deprecated. Use createAutoSequenceActionsEffect instead."
  );
  return createAutoSequenceActionsEffect(config);
}
