/**
 * ConstructTab Event Service
 *
 * Centralized event handling for the ConstructTab component.
 * This service handles all the event coordination between different child components
 * that was previously scattered throughout the massive ConstructTab component.
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
import type { SequenceData } from "../../../../shared/foundation/domain/models/sequence-data";

import type { ConstructCoordinator } from "./construct-coordinator";
import type { PictographData } from "../../../../shared/pictograph/shared/domain/models/pictograph-data";
import type { ReversalDetector } from "$lib/shared/create/services/reversal-detector";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import { getConstructCoordinator } from "$lib/features/create/shared/get-construct-coordinator";
import { buildAppendedOptionSequence } from "$lib/features/create/construct/option-picker/services/build-appended-option-sequence";
import { invalidateLoopDisplayCache } from "$lib/shared/create/services/loop-certificate";
import { UndoOperationType } from "./undo-manager";

export class CreateModuleEventHandler {
  private constructCoordinator: ConstructCoordinator | null = null;
  private ReversalDetector: ReversalDetector | null = null;
  private initialized = false;

  // Callback to access current sequence from component state
  private getCurrentSequenceCallback: (() => SequenceData | null) | null = null;
  private updateSequenceCallback: ((sequence: SequenceData) => void) | null =
    null;

  // Resolves once an in-flight sequence creation settles (see
  // whenCurrentSequenceReady in the sequence state orchestrator)
  private awaitCurrentSequenceCallback:
    | (() => Promise<SequenceData | null>)
    | null = null;

  // Callback to add option to history
  private addOptionToHistoryCallback:
    | ((stepIndex: number, stepData: StepData) => void)
    | null = null;

  // Callback to push undo snapshot
  private pushUndoSnapshotCallback:
    | ((type: UndoOperationType, metadata?: unknown) => void)
    | null = null;
  private optionAppliedCallback:
    | ((sequence: SequenceData, stepNumber: number) => void)
    | null = null;

  constructor() {
    // Don't initialize services in constructor - wait for lazy initialization
  }

  private initializeServices() {
    if (this.initialized) {
      return; // Already initialized
    }

    // Resolve services via ITI container - services may be undefined if not registered
    try {
      this.constructCoordinator =
        (getConstructCoordinator() as unknown as
          | ConstructCoordinator
          | undefined) ?? null;
    } catch {
      this.constructCoordinator = null;
    }

    this.ReversalDetector = reversalDetector;

    // Orientation calculation is now provided by canonical module functions
    // (always available), so initialization succeeds whenever any service is present.
    this.initialized = true;
  }

  /**
   * Set callbacks to access sequence state from component
   */
  setSequenceStateCallbacks(
    getCurrentSequence: () => SequenceData | null,
    updateSequence: (sequence: SequenceData) => void,
    awaitCurrentSequence?: () => Promise<SequenceData | null>
  ): void {
    this.getCurrentSequenceCallback = getCurrentSequence;
    this.updateSequenceCallback = updateSequence;
    this.awaitCurrentSequenceCallback = awaitCurrentSequence ?? null;
  }

  setAddOptionToHistoryCallback(
    addOptionToHistory: (stepIndex: number, stepData: StepData) => void
  ): void {
    this.addOptionToHistoryCallback = addOptionToHistory;
  }

  setPushUndoSnapshotCallback(
    pushUndoSnapshot: (type: UndoOperationType, metadata?: unknown) => void
  ): void {
    this.pushUndoSnapshotCallback = pushUndoSnapshot;
  }

  setOptionAppliedCallback(
    callback: (sequence: SequenceData, stepNumber: number) => void
  ): void {
    this.optionAppliedCallback = callback;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeServices();
    }
  }

  /**
   * Handle option selection in the Create module
   * OPTIMIZED: Add to sequence immediately for responsive UX, then process in background
   */
  async handleOptionSelected(option: PictographData): Promise<void> {
    try {
      performance.mark("event-service-start");
      this.ensureInitialized();

      // Get current sequence from component state. Selecting a start placement
      // flips the UI to the option picker before the sequence finishes being
      // created, so a fast tap can land while this is still null — wait for the
      // in-flight creation rather than failing the tap.
      const currentSequence =
        this.getCurrentSequenceCallback?.() ??
        (await this.awaitCurrentSequenceCallback?.()) ??
        null;
      if (!currentSequence) {
        throw new Error("No current sequence available");
      }

      performance.mark("initialization-complete");

      // Calculate correct beat number based on current sequence length
      const nextStepNumber = currentSequence.steps.length + 1;

      // 📸 PUSH UNDO SNAPSHOT: Save state BEFORE adding beat (now deferred via queueMicrotask)
      this.pushUndoSnapshotCallback?.(UndoOperationType.ADD_BEAT, {
        stepNumber: nextStepNumber,
        description: `Add step ${nextStepNumber}`,
      });

      const application = buildAppendedOptionSequence(currentSequence, option, {
        reversalDetector: this.ReversalDetector,
        onRecoverableError: (stage, error) => {
          const operation =
            stage === "reversal"
              ? "detect reversals"
              : "calculate orientations";
          console.warn(
            `⚠️ CreateModuleEventHandler: Failed to ${operation} for beat ${nextStepNumber}:`,
            error
          );
        },
      });
      const stepData = application.step;
      const finalSequence = application.sequence;

      performance.mark("beat-data-created");
      performance.mark("orientation-processing-complete");

      // 🚀 SINGLE UI UPDATE: Add beat with orientations already calculated
      performance.mark("sequence-updated");

      this.updateSequenceCallback?.(finalSequence);
      this.optionAppliedCallback?.(finalSequence, nextStepNumber);
      invalidateLoopDisplayCache();
      performance.mark("ui-callback-complete");

      // 📝 ADD TO HISTORY: Track this option addition for undo functionality
      this.addOptionToHistoryCallback?.(nextStepNumber - 1, stepData); // stepIndex is 0-based
      performance.mark("history-updated");

      // 📡 COORDINATION: Notify other components (async, non-blocking)
      performance.mark("coordination-start");
      if (this.constructCoordinator) {
        this.constructCoordinator.handleBeatAdded(stepData).catch((error) => {
          console.warn(
            "⚠️ CreateModuleEventHandler: Coordination service error:",
            error
          );
        });
      }
      performance.mark("coordination-complete");
    } catch (error) {
      console.error("❌ Error handling option selection:", error);
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Something went wrong adding that step",
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: {
          module: "create",
          action: "add-beat",
        },
      });
      throw error;
    }
  }

  /**
   * Handle beat modification from the Graph Editor
   */
  handleBeatModified(_stepNumber: number, _beatData: StepData): void {
    // stepIndex and stepData parameters are not used but kept for interface compatibility
    // Handle beat modifications from graph editor
    // Note: The coordination service doesn't have handleBeatModified,
    // so we'll handle this locally or extend the interface if needed
  }

  /**
   * Handle arrow selection from the Graph Editor
   */
  handleArrowSelected(_arrowData: unknown): void {
    // arrowData parameter is not used but kept for interface compatibility
    // Handle arrow selection events from graph editor
    // This could be used for highlighting or additional UI feedback
  }

  /**
   * Handle graph editor visibility changes
   */
  handleGraphEditorVisibilityChanged(_isVisible: boolean): void {
    // isVisible parameter is not used but kept for interface compatibility
    // Handle graph editor visibility changes if needed
  }

  /**
   * Handle export setting changes from the Export Panel
   */
  handleExportSettingChanged(_event: CustomEvent): void {
    // event parameter is not used but kept for interface compatibility
    // Handle export setting changes - could save to settings service
  }

  /**
   * Handle preview update requests from the Export Panel
   */
  handlePreviewUpdateRequested(_event: CustomEvent): void {
    // event parameter is not used but kept for interface compatibility
    // Handle preview update requests
  }

  /**
   * Handle export requests from the Export Panel
   */
  handleExportRequested(event: CustomEvent): void {
    const { type, config } = event.detail;

    // Handle export requests
    if (type === "current") {
      // TODO: Implement actual export service call
      alert(
        `Exporting sequence "${config.sequence?.name || "Untitled"}" with ${config.sequence?.steps?.length || 0} steps`
      );
    } else if (type === "all") {
      // TODO: Implement actual export all service call
      alert("Exporting all sequences in library");
    }
  }

  /**
   * Setup component coordination
   */
  setupComponentCoordination(): void {
    // Ensure services are initialized
    this.ensureInitialized();

    // Register this service with the coordination service
    if (this.constructCoordinator) {
      this.constructCoordinator.setupComponentCoordination({
        constructTab: {
          handleEvent: (eventType: string, _data: unknown) => {
            switch (eventType) {
              case "ui_transition":
                // Handle legacy transition events if needed
                break;
              default:
                // Handle other events if needed
                break;
            }
          },
        },
      });
    }
  }

  // ============================================================================
  // INTERFACE IMPLEMENTATION
  // ============================================================================

  /**
   * Handle tab switch events
   */
  handleTabSwitch(_tabId: string): void {
    // tabId parameter is not used but kept for interface compatibility
    // Implementation for tab switching logic
  }

  /**
   * Handle workbench update events
   */
  handleWorkbenchUpdate(_data: unknown): void {
    // data parameter is not used but kept for interface compatibility
    // Implementation for workbench update logic
  }

  /**
   * Handle option selection events
   */
  handleOptionSelection(_option: unknown): void {
    // option parameter is not used but kept for interface compatibility
    // Implementation for option selection logic
  }
}

// Lazy singleton instance
let _CreateModuleEventHandler: CreateModuleEventHandler | null = null;

/**
 * Get the singleton instance of ConstructTabEventService
 * Creates the instance only when first accessed, ensuring DI container is ready
 */
export function getCreateModuleEventHandler(): CreateModuleEventHandler {
  if (!_CreateModuleEventHandler) {
    _CreateModuleEventHandler = new CreateModuleEventHandler();
  }
  return _CreateModuleEventHandler;
}

// Export the getter function directly for backward compatibility
export const constructTabEventService = getCreateModuleEventHandler;
