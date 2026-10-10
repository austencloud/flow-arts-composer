/**
 * Navigation Sync Manager
 *
 * Consolidates navigation synchronization effects into a single manager.
 * Handles bidirectional sync between navigation state and Create Module State.
 *
 * ARCHITECTURE NOTE:
 * - Effect 1: Navigation → CreateModule (nav is source of truth when it changes)
 * - Effect 2: CreateModule → Navigation (only when internal toggle changes activeSection)
 *
 * The key insight is that Effect 2 must NOT react to navigation changes, only to
 * CreateModule.activeSection changes. Otherwise, when nav changes:
 * 1. Effect 1 tries to sync nav→create
 * 2. Effect 2 runs concurrently, sees old activeSection, syncs create→nav (WRONG!)
 *
 * We use `untrack` to prevent Effect 2 from depending on navigationState.
 *
 * Domain: Create module - Navigation State Management
 */

import { untrack } from "svelte";
import type { CreateModuleStateForSync } from "../../services/navigation-syncer";
import type { NavigationSyncer } from "../../services/navigation-syncer";
import type { createCreateModuleState as CreateModuleStateType } from "../create-module-state.svelte";
import type { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

type CreateModuleState = ReturnType<typeof CreateModuleStateType>;
type NavigationState = typeof navigationState;

export interface NavigationSyncManagerConfig {
  CreateModuleState: CreateModuleState;
  navigationState: NavigationState;
  NavigationSyncer: NavigationSyncer;
}

/**
 * Creates navigation sync effects
 * @returns Cleanup function
 */
export function createNavigationSyncEffects(
  config: NavigationSyncManagerConfig
): () => void {
  const { CreateModuleState, navigationState, NavigationSyncer } = config;
  const createStateForSync =
    CreateModuleState as unknown as CreateModuleStateForSync;

  // Effect 1: Sync navigation state TO Create Module State
  // Runs when navigationState.activeTab changes
  const cleanup1 = $effect.root(() => {
    $effect(() => {
      NavigationSyncer.syncNavigationToCreateModule(
        createStateForSync,
        navigationState
      );
    });
  });

  // Effect 2: Sync Create Module State BACK to navigation state
  // CRITICAL: Uses untrack to ONLY react to CreateModuleState.activeSection changes,
  // NOT to navigationState changes. This prevents the race condition where both
  // effects run when nav changes, and Effect 2 reverts the change.
  const cleanup2 = $effect.root(() => {
    $effect(() => {
      // Skip if the internal toggle is updating (it syncs explicitly)
      if (CreateModuleState.isUpdatingFromToggle) return;

      // Skip if navigating back (goBack handles this)
      if (CreateModuleState.isNavigatingBack) return;

      // Skip if persistence not ready
      if (!CreateModuleState.isPersistenceInitialized) return;

      // Read activeSection to establish dependency (this is what triggers the effect)
      const activeSection = CreateModuleState.activeSection;

      // Read navigation state WITHOUT establishing dependency
      // This prevents Effect 2 from running when navigation changes
      const navSection = untrack(() => navigationState.currentSection);

      // Only sync if CreateModule differs from nav (CreateModule is source)
      if (activeSection && activeSection !== navSection) {
        navigationState.setCurrentSection(activeSection);
      }
    });
  });

  return () => {
    cleanup1();
    cleanup2();
  };
}
