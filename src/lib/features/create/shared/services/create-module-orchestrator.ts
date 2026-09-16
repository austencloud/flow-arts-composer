/**
 * Create Module Service Implementation
 *
 * Orchestrates complex business workflows for the Create module.
 * Coordinates multiple microservices and manages cross-cutting concerns.
 *
 * This service handles the business logic that was previously scattered
 * across components, providing a clean separation of concerns.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
// import type { StartPlacementManager } from "../../tool-panel/construct/start-placement-picker/services/contracts";
// IStartPlacementSelectionService removed - using unified service
import { constructTabEventService } from "./create-module-event-handler";

export class CreateModuleOrchestrator {
  private currentTab: string = "construct"; // Default tab
  private tabStates: Map<string, unknown> = new Map();

  constructor() {} // Start placement selection now handled by unified service // private readonly StartPlacementManager: StartPlacementManager // @inject(TYPES.StartPlacementManager)

  /**
   * Orchestrates the complete start placement selection workflow
   */
  selectStartPlacement(_placement: PictographData): void {
    try {
      // Business logic: Convert PictographData to StepData for the service
      // await this.StartPlacementManager.setStartPlacement(stepData);
    } catch (error) {
      console.error(
        "❌ CreateModuleOrchestrator: Error selecting start placement:",
        error
      );
      throw error; // Re-throw to let caller handle UI error states
    }
  }

  /**
   * Orchestrates the complete option selection workflow
   */
  async selectOption(option: PictographData): Promise<void> {
    try {
      // Business logic: Use the construct tab event service to handle option selection
      const eventService = constructTabEventService();
      await eventService.handleOptionSelected(option);
    } catch (error) {
      console.error(
        "❌ CreateModuleOrchestrator: Error selecting option:",
        error
      );
      throw error; // Re-throw to let caller handle UI error states
    }
  }

  /**
   * Initializes the Create module and sets up component coordination
   */
  initialize(): void {
    try {
      // Setup component coordination
      const eventService = constructTabEventService();
      eventService.setupComponentCoordination(); // Not async, no await needed
    } catch (error) {
      console.error(
        "❌ CreateModuleOrchestrator: Error initializing Create module:",
        error
      );
      throw error; // Re-throw to let caller handle UI error states
    }
  }

  /**
   * Get the current active tab
   */
  getCurrentTab(): string {
    return this.currentTab;
  }

  /**
   * Switch to a different tab
   */
  switchToTab(tabId: string): void {
    try {
      this.currentTab = tabId;
    } catch (error) {
      console.error(
        `❌ CreateModuleOrchestrator: Error switching to tab ${tabId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get the state for a specific tab
   */
  getTabState(tabId: string): unknown {
    return this.tabStates.get(tabId) || null;
  }

  /**
   * Update the state for a specific tab
   */
  updateTabState(tabId: string, state: unknown): void {
    this.tabStates.set(tabId, state);
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const createModuleOrchestrator = new CreateModuleOrchestrator();
