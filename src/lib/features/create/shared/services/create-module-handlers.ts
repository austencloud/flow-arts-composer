/**
 * CreateModuleHandlers.ts
 *
 * Service implementation for CreateModule event handlers.
 * Extracts handler logic from component to improve testability and maintainability.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { CreateModuleState } from "../state/create-module-state.svelte";
import type { PanelCoordinationState } from "../state/panel-coordination-state.svelte";
import type { ConstructTabState } from "../state/construct-tab-state.svelte";
import type { CreateModuleOrchestrator } from "#lib/features/create/shared/services/create-module-orchestrator.js";

/**
 * Parameters for clear sequence handler
 */
export interface ClearSequenceParams {
  CreateModuleState: CreateModuleState;
  constructTabState: ConstructTabState;
  panelState: PanelCoordinationState;
}
import type { StepOperator } from "#lib/features/create/shared/services/step-operator.js";
import { executeClearSequenceWorkflow } from "#lib/shared/create/utils/clear-sequence-workflow.js";

export class CreateModuleHandlers {
  constructor(
    private CreateModuleOrchestrator: CreateModuleOrchestrator,
    private StepOperator: StepOperator
  ) {}

  async handleOptionSelected(option: PictographData): Promise<void> {
    try {
      await this.CreateModuleOrchestrator.selectOption(option);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to select option";
      console.error(
        "❌ CreateModuleHandlers: Error handling option selection:",
        err
      );
      throw new Error(errorMessage);
    }
  }

  handleOpenVideoRecordPanel(panelState: PanelCoordinationState): void {
    panelState.openVideoRecordPanel();
  }

  /**
   * Handle export panel button click - opens the sequence viewer
   */
  handleOpenExportPanel(panelState: PanelCoordinationState): void {
    panelState.openSequenceViewer();
  }

  /**
   * Handle clear sequence button click
   */
  async handleClearSequence(params: ClearSequenceParams): Promise<void> {
    try {
      await executeClearSequenceWorkflow(params);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to clear sequence";
      console.error(
        "❌ CreateModuleHandlers: Failed to clear sequence completely",
        err
      );
      throw new Error(errorMessage);
    }
  }

  /**
   * Handle remove beat button click
   */
  handleRemoveStep(
    stepIndex: number,
    CreateModuleState: CreateModuleState | null
  ): void {
    if (!CreateModuleState) {
      console.warn(
        "⚠️ CreateModuleHandlers: Cannot remove beat - CreateModuleState not initialized"
      );
      throw new Error("CreateModuleState not initialized");
    }

    try {
      this.StepOperator.removeStep(stepIndex, CreateModuleState);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to remove step";
      console.error("❌ CreateModuleHandlers: Failed to remove beat", err);
      throw new Error(errorMessage);
    }
  }

  handleOpenFilterPanel(panelState: PanelCoordinationState): void {
    panelState.openFilterPanel();
  }

  /**
   * Handle open sequence actions button click
   */
  handleOpenSequenceActions(panelState: PanelCoordinationState): void {
    panelState.openSequenceActionsPanel("workflow");
  }
}

import { createModuleOrchestrator } from "./create-module-orchestrator";
import { stepOperator } from "./step-operator";

export const createModuleHandlers = new CreateModuleHandlers(
  createModuleOrchestrator,
  stepOperator
);
