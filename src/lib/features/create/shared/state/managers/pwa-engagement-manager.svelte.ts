/**
 * PWA Engagement Manager
 *
 * Tracks PWA engagement when user creates a sequence.
 * Consolidates PWA tracking logic from CreateModule.svelte.
 *
 * Domain: Create module - PWA Engagement Tracking
 */

import { getPWAEngagementTracker } from "#lib/shared/mobile/get-pwa-engagement-tracker.js";
import type { createCreateModuleState as CreateModuleStateType } from "../create-module-state.svelte";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

type CreateModuleState = ReturnType<typeof CreateModuleStateType>;

// Lazy logger initialization to avoid circular dependency issues
let logger: ReturnType<typeof createComponentLogger> | null = null;
const getLogger = () => {
  if (!logger) {
    logger = createComponentLogger("PWAEngagementManager");
  }
  return logger;
};

export interface PWAEngagementConfig {
  CreateModuleState: CreateModuleState;
}

/**
 * Creates PWA engagement tracking effect
 * @returns Cleanup function
 */
export function createPWAEngagementEffect(
  config: PWAEngagementConfig
): () => void {
  const { CreateModuleState } = config;
  let hasTrackedSequenceCreation = false;

  return $effect.root(() => {
    $effect(() => {
      if (hasTrackedSequenceCreation) return;
      if (!CreateModuleState.hasSequence) return;

      try {
        const engagementService = getPWAEngagementTracker();
        engagementService.recordSequenceCreated();
        engagementService.recordInteraction(); // Also count as interaction
        hasTrackedSequenceCreation = true;
        getLogger().log("PWA engagement: sequence created");
      } catch {
        // Service may not be available, that's ok
      }
    });
  });
}
