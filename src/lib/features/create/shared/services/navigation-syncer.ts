/**
 * Create Module Navigation Sync Service Implementation
 *
 * Manages bidirectional synchronization between global navigation and CreateModule's tool panel tabs.
 * Prevents infinite loops through guard flags and validates tab accessibility based on sequence state.
 *
 * Domain: Create module - Tool Panel Navigation (Construct/Generate)
 * Note: Animate and Share are now separate panels, not BuildSections.
 * Extracted from CreateModule.svelte monolith.
 */

import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";

export type CreateTab = "construct" | "generate";

/** @deprecated Use CreateTab instead */
export type BuildSection = CreateTab;

/**
 * Minimal interface for CreateModule state needed for navigation sync
 */
export interface CreateModuleStateForSync {
  activeSection: string;
  isPersistenceInitialized: boolean;
  isNavigatingBack: boolean;
  isUpdatingFromToggle: boolean;
  canAccessEditTab: boolean;
  setActiveToolPanel: (panel: string) => void;
}

/**
 * Minimal interface for navigation state needed for navigation sync
 */
export interface NavigationStateForSync {
  currentSection: string;
  setCurrentSection: (section: string) => void;
}

export class NavigationSyncer {
  private logger = createComponentLogger("CreateModule:NavigationSync");

  syncNavigationToCreateModule(
    CreateModuleState: CreateModuleStateForSync,
    navigationState: NavigationStateForSync
  ): void {
    const currentMode = navigationState.currentSection;
    const CreateModuleCurrentMode = CreateModuleState.activeSection;

    this.logger.log("Navigation → CreateModule sync:", {
      currentMode,
      CreateModuleCurrentMode,
      isPersistenceInitialized: CreateModuleState.isPersistenceInitialized,
      isNavigatingBack: CreateModuleState.isNavigatingBack,
      isUpdatingFromToggle: CreateModuleState.isUpdatingFromToggle,
    });

    // Skip if navigation is to a non-Create tab (e.g., "browse", "library")
    const validCreateTabs = [
      "construct",
      "generate",
      "shape-engine",
      "spell",
      "assemble",
      "fuse",
      "tunnel",
    ];
    if (!validCreateTabs.includes(currentMode)) {
      return;
    }

    // Skip if:
    // 1. Already in sync
    // 2. Persistence not ready
    // 3. Currently navigating back (prevent loop)
    // 4. Updating from toggle (toggle handles its own sync)
    if (
      currentMode === CreateModuleCurrentMode ||
      !CreateModuleState.isPersistenceInitialized ||
      CreateModuleState.isNavigatingBack ||
      CreateModuleState.isUpdatingFromToggle
    ) {
      return;
    }

    // Validate tab access (guard against invalid navigation)
    if (
      !this.validateTabAccess(
        currentMode as BuildSection,
        CreateModuleState.canAccessEditTab
      )
    ) {
      console.warn(
        `🚫 Cannot access ${currentMode} tab without a sequence. Redirecting to construct.`
      );
      navigationState.setCurrentSection(this.getFallbackTab());
      return;
    }

    this.logger.log(
      "Updating CreateModule state from navigation:",
      currentMode
    );
    CreateModuleState.setActiveToolPanel(currentMode as BuildModeId);
    this.logger.success(
      "CreateModule state updated to:",
      CreateModuleState.activeSection
    );
  }

  syncCreateModuleToNavigation(
    CreateModuleState: CreateModuleStateForSync,
    navigationState: NavigationStateForSync
  ): void {
    // Skip if updating from toggle (toggle already syncs to navigation)
    if (CreateModuleState.isUpdatingFromToggle) {
      return;
    }

    // Skip if navigating back (prevents sync loop during navigation)
    if (CreateModuleState.isNavigatingBack) {
      return;
    }

    // Skip if persistence not initialized yet (prevents initial mount from overriding
    // the navigation state that was explicitly set via sidebar click)
    if (!CreateModuleState.isPersistenceInitialized) {
      return;
    }

    const CreateModuleCurrentMode = CreateModuleState.activeSection;
    const navCurrentMode = navigationState.currentSection;

    if (CreateModuleCurrentMode && CreateModuleCurrentMode !== navCurrentMode) {
      navigationState.setCurrentSection(CreateModuleCurrentMode);
    }
  }

  validateTabAccess(_mode: BuildSection, _canAccessEditTab: boolean): boolean {
    // Construct and generate are always accessible
    return true;
  }

  getFallbackTab(): BuildSection {
    return "construct";
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const navigationSyncer = new NavigationSyncer();
