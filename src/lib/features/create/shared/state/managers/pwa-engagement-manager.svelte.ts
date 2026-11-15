/**
 * PWA Engagement Manager
 *
 * Tracks PWA engagement when user creates a sequence, and offers the phone
 * install card once the person has made or changed a sequence this visit.
 * A sequence restored from the last visit does not count: the card follows
 * something they just did, not the page loading. On a guest's later day the
 * returning-guest note takes that moment instead (guest-note-state).
 *
 * Domain: Create module - PWA Engagement Tracking
 */

import { getPWAEngagementTracker } from "#lib/shared/mobile/get-pwa-engagement-tracker.js";
import type { createCreateModuleState as CreateModuleStateType } from "../create-module-state.svelte";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { installNudge } from "#lib/shared/pwa/install-nudge-state.svelte.js";
import { guestNote } from "#lib/shared/guest-note/guest-note-state.svelte.js";
import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
import {
  isModalOnScreen,
  waitForIdle,
} from "#lib/shared/components/idle-wait.js";
import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

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

// A tool restores its saved sequence a moment after it first appears. Changes
// inside this window move the starting point instead of counting as made.
const RESTORE_SETTLE_MS = 2500;

/**
 * Creates PWA engagement tracking effect
 * @returns Cleanup function
 */
export function createPWAEngagementEffect(
  config: PWAEngagementConfig
): () => void {
  const { CreateModuleState } = config;
  let hasTrackedSequenceCreation = false;
  // What each Create tool held when this visit first saw it, so a restored
  // sequence reads as the starting point rather than as something made.
  const startingSequenceByTool = new Map<
    string,
    { signature: string; seenAt: number }
  >();
  let hasOfferedInstall = false;
  let cancelIdleWait: (() => void) | null = null;

  const stop = $effect.root(() => {
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

    $effect(() => {
      if (hasOfferedInstall) return;
      if (!CreateModuleState.isPersistenceInitialized) return;
      const tool = String(navigationState.activeTab ?? "");
      const sequence =
        CreateModuleState.getActiveTabSequenceState().currentSequence;
      const signature = sequence
        ? `${sequence.id}:${sequence.steps?.length ?? 0}`
        : "";

      const start = startingSequenceByTool.get(tool);
      if (!start) {
        startingSequenceByTool.set(tool, { signature, seenAt: Date.now() });
        return;
      }
      if (signature === start.signature) return;
      if (Date.now() - start.seenAt < RESTORE_SETTLE_MS) {
        start.signature = signature;
        return;
      }
      if (!CreateModuleState.hasSequence()) return;

      hasOfferedInstall = true;
      // The card rises only once the person has stopped for a few seconds,
      // and not over the sign-up sheet or a modal dialog (those are found
      // by the auth sheet's state and an `aria-modal` element on screen).
      cancelIdleWait = waitForIdle(() => {
        if (isModalOnScreen(authDrawerState.open)) return false;
        // A returning guest's note goes first; the install card waits for
        // another visit, so nobody gets both at once.
        if (guestNote.offer("create")) return true;
        installNudge.offer("first_sequence");
        return true;
      });
    });
  });

  return () => {
    cancelIdleWait?.();
    stop();
  };
}
