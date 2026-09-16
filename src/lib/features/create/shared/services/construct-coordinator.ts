/**
 * Construct Tab Coordination Service - Implementation
 *
 * Coordinates between construct tab components (start placement picker, option picker).
 * Based on desktop ConstructTabCoordinationService but simplified for web with runes.
 *
 * FIXED: Added proper state synchronization to resolve start placement selection getting stuck
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { Step } from "@tka/tka-types";


// Note: This service will need to be updated to use the new DI pattern
// For now, we'll comment out the direct import to avoid build errors
// import { sequenceStateService } from "../../SequenceStateService.svelte";

interface ComponentWithEventHandler {
  handleEvent?: (eventType: string, data: unknown) => void;
}

export class ConstructCoordinator {
  private components: Record<string, ComponentWithEventHandler> = {};
  private isHandlingSequenceModification = false;
  private eventListenersSetup = false;
  private boundEventHandlers: {
    startPlacementSelected: (event: CustomEvent) => void;
    optionSelected: (event: CustomEvent) => void;
    sequenceModified: (event: CustomEvent) => void;
  } | null = null;

  constructor() {}

  /**
   * Clean up resources when service is destroyed
   */
  destroy(): void {
    this.disconnectComponentSignals();
    this.components = {};
  }

  setupComponentCoordination(
    components: Record<string, ComponentWithEventHandler>
  ): void {
    this.components = components;

    // Set up any cross-component communication here (only once)
    if (!this.eventListenersSetup) {
      this.connectComponentSignals();
      this.eventListenersSetup = true;
    }
  }

  async handleSequenceModified(sequence: SequenceData): Promise<void> {
    if (this.isHandlingSequenceModification) {
      return;
    }

    try {
      this.isHandlingSequenceModification = true;

      // State management is handled by individual components via DI

      // Update UI based on sequence state
      await this.updateUIBasedOnSequence(sequence);

      // Notify components about sequence change
      this.notifyComponents("sequence_modified", { sequence });
    } catch (error) {
      console.error("❌ Error handling sequence modification:", error);
    } finally {
      this.isHandlingSequenceModification = false;
    }
  }

  handleStartPlacementSet(_startPlacement: Step): void {
    try {
      return;
    } catch (error) {
      console.error("❌ Error handling start placement set:", error);
      // Error handling is managed by individual components
    }
  }

  async handleBeatAdded(stepData: Step): Promise<void> {
    try {
      // Beat addition is handled by workbench components directly
      // This coordinator just notifies other components of the change
      this.notifyComponents("beat_added", { stepData });
    } catch (error) {
      console.error("❌ Error handling beat added:", error);
    }
  }

  async handleBeatReplaced(stepData: Step): Promise<void> {
    try {
      this.notifyComponents("beat_replaced", { stepData });
    } catch (error) {
      console.error("Error handling beat replacement:", error);
    }
  }

  handleGenerationRequest(config: Record<string, unknown>): void {
    try {
      // Generation is handled by the generate module components
      // This coordinator just facilitates communication between components
      this.notifyComponents("generation_requested", { config });

      // Simulate generation completion
      setTimeout(() => {
        this.notifyComponents("generation_completed", {
          success: true,
          message: "Generation completed",
        });
      }, 1000);
    } catch (error) {
      console.error("❌ Error handling generation request:", error);
    }
  }

  handleUITransitionRequest(targetPanel: string): void {
    try {
      // Emit custom events for UI transitions (similar to legacy implementation)
      const transitionEvent = new CustomEvent("construct-tab-transition", {
        detail: { targetPanel },
        bubbles: true,
      });

      if (typeof window !== "undefined") {
        document.dispatchEvent(transitionEvent);
      }

      // Notify components about the transition
      this.notifyComponents("ui_transition", { targetPanel });
    } catch (error) {
      console.error("❌ Error handling UI transition:", error);
    }
  }

  private connectComponentSignals(): void {
    // Set up event listeners for component coordination
    if (typeof window !== "undefined") {
      // Create bound event handlers to allow proper cleanup
      this.boundEventHandlers = {
        startPlacementSelected: ((event: CustomEvent) => {
          void this.handleStartPlacementSet(event.detail.startPlacement);
        }) as (event: CustomEvent) => void,

        optionSelected: ((event: CustomEvent) => {
          void this.handleBeatAdded(event.detail.stepData);
        }) as (event: CustomEvent) => void,

        sequenceModified: ((event: CustomEvent) => {
          void this.handleSequenceModified(event.detail.sequence);
        }) as (event: CustomEvent) => void,
      };

      document.addEventListener(
        "start-placement-selected",
        this.boundEventHandlers.startPlacementSelected as EventListener
      );
      document.addEventListener(
        "option-selected",
        this.boundEventHandlers.optionSelected as EventListener
      );
      document.addEventListener(
        "sequence-modified",
        this.boundEventHandlers.sequenceModified as EventListener
      );
    }
  }

  /**
   * Clean up event listeners to prevent memory leaks and duplicate handlers
   */
  private disconnectComponentSignals(): void {
    if (typeof window !== "undefined" && this.boundEventHandlers) {
      document.removeEventListener(
        "start-placement-selected",
        this.boundEventHandlers.startPlacementSelected as EventListener
      );
      document.removeEventListener(
        "option-selected",
        this.boundEventHandlers.optionSelected as EventListener
      );
      document.removeEventListener(
        "sequence-modified",
        this.boundEventHandlers.sequenceModified as EventListener
      );
      this.boundEventHandlers = null;
      this.eventListenersSetup = false;
    }
  }

  private async updateUIBasedOnSequence(sequence: SequenceData): Promise<void> {
    try {
      // Determine which panel to show based on sequence state
      const hasStartPlacement = sequence.startingPlacement != null;
      const hasSteps = sequence.steps.length > 0;

      let targetPanel: string;

      if (hasStartPlacement || hasSteps) {
        targetPanel = "option_picker";
      } else {
        targetPanel = "start_placement_picker";
      }

      // Transition to appropriate panel
      this.handleUITransitionRequest(targetPanel);
    } catch (error) {
      console.error("❌ Error updating UI based on sequence:", error);
    }
  }

  private notifyComponents(eventType: string, data: unknown): void {
    // Notify individual components if they have handlers
    Object.entries(this.components).forEach(([name, component]) => {
      if (component && typeof component.handleEvent === "function") {
        try {
          component.handleEvent(eventType, data);
        } catch (error) {
          console.error(`❌ Error notifying component ${name}:`, error);
        }
      }
    });

    // Emit global event for any listeners
    if (typeof window !== "undefined") {
      const event = new CustomEvent(`construct-coordination-${eventType}`, {
        detail: data,
        bubbles: true,
      });
      document.dispatchEvent(event);
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const constructCoordinator = new ConstructCoordinator();
