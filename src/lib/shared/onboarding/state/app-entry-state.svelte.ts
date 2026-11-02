/**
 * App Entry State
 *
 * Manages the post-onboarding experience:
 * - Wizard exit transition after first-run wizard
 * - Create tutorial walkthrough (the guided build)
 *
 * State machine phases:
 *   "wizard-active" -> "wizard-exiting" -> "create-tutorial" -> "complete"
 *
 * Nothing offers the walkthrough on its own: it starts from Settings
 * ("replay tutorial") or the admin toolbar, both through replay(), or after
 * the first-run wizard when AUTO_TOURS_ENABLED is on.
 *
 * Returning users start at "complete" (checked via localStorage).
 * Persisted to localStorage + Firebase (same pattern as first-run-state).
 *
 * hasCompleted and phase are seeded from ONE expression (isOnboarded below)
 * so they can never disagree - see the hasCompleted-phase-divergence fix.
 * syncFromCloud() resets to the clean default on a missing doc (mirrors
 * first-run-state.svelte.ts) so a reused device doesn't inherit a prior
 * account's completed flag.
 */

import { AUTO_TOURS_ENABLED } from "../domain/onboarding-flags";
import {
  logOnboardingTutorialAccepted,
  logOnboardingTutorialCompleted,
} from "#lib/shared/analytics/services/onboarding-events.js";
import {
  safeLocalStorageSetItem,
  removeLocalStorageItem,
} from "#lib/shared/foundation/services/storage-manager.js";

export type AppEntryPhase =
  | "wizard-active"
  | "wizard-exiting"
  | "create-tutorial"
  | "complete";

const APP_ENTRY_COMPLETED_KEY = "tka-app-entry-completed";

interface AppEntryState {
  phase: AppEntryPhase;
  /** Whether entry has been completed at least once (persisted) */
  hasCompleted: boolean;
  /** True once the FROM-cloud pull has resolved (or is known unnecessary). */
  cloudSynced: boolean;
  /** True while a cloud pull is in flight. */
  syncInProgress: boolean;
}

function createAppEntryState() {
  const isBrowser = typeof window !== "undefined";

  const completedFlag = isBrowser
    ? localStorage.getItem(APP_ENTRY_COMPLETED_KEY) === "true"
    : false;

  // If first-run is done but entry isn't, skip straight to create-tutorial.
  // Otherwise the "wizard-active" phase falls through to main app and the
  // tutorial is never shown for returning users who missed it.
  // With auto-tours disabled, first-run-done users land straight on the app.
  const firstRunDone =
    isBrowser && localStorage.getItem("tka-first-run-completed") === "true";

  // SINGLE SEED: an account counts as onboarded if it explicitly completed
  // app-entry, OR first-run is done while auto-tours are switched off (those
  // users skip straight to the app under that flag state). hasCompleted and
  // phase BOTH derive from this one boolean, so they can never disagree.
  const isOnboarded = completedFlag || (firstRunDone && !AUTO_TOURS_ENABLED);

  const initialPhase: AppEntryPhase = isOnboarded
    ? "complete"
    : firstRunDone // implies AUTO_TOURS_ENABLED here, since isOnboarded is false
      ? "create-tutorial"
      : "wizard-active";

  const state = $state<AppEntryState>({
    phase: initialPhase,
    hasCompleted: isOnboarded,
    cloudSynced: false,
    syncInProgress: false,
  });

  // Duration constants (ms) for the choreography
  const WIZARD_EXIT_DURATION = 400;

  /** Flip the sync gate once the first cloud read has settled. */
  function resolveCloudSync() {
    state.cloudSynced = true;
    state.syncInProgress = false;
  }

  return {
    get phase() {
      return state.phase;
    },
    get hasCompleted() {
      return state.hasCompleted;
    },
    get cloudSynced() {
      return state.cloudSynced;
    },
    get syncInProgress() {
      return state.syncInProgress;
    },

    /**
     * Check if the full entry flow is done (user should see normal app).
     */
    isComplete(): boolean {
      return state.phase === "complete";
    },

    /**
     * Check if create tutorial should be showing.
     */
    isCreateTutorial(): boolean {
      return state.phase === "create-tutorial";
    },

    /**
     * Check if entry animation is in progress (wizard exit transition).
     */
    isEntryAnimating(): boolean {
      return state.phase === "wizard-exiting";
    },

    /**
     * Called when the first-run wizard finishes.
     * Kicks off the wizard exit -> create tutorial sequence.
     */
    startEntrySequence(force = false) {
      if (state.hasCompleted && !force) {
        state.phase = "complete";
        return;
      }

      // Auto-tours are deactivated: skip the tutorial entirely and drop the
      // user straight into the app after the first-run wizard.
      if (!AUTO_TOURS_ENABLED) {
        this.completeEntry("skipped");
        return;
      }

      state.phase = "wizard-exiting";

      setTimeout(() => {
        state.phase = "create-tutorial";
      }, WIZARD_EXIT_DURATION);
    },

    /**
     * Called when create tutorial completes (all steps done or skipped).
     * `reason` distinguishes a genuine finish from a mid-wizard skip so
     * onboarding_tutorial_completed only fires for an actual completion.
     */
    completeEntry(reason: "completed" | "skipped" = "completed") {
      state.phase = "complete";
      state.hasCompleted = true;

      if (isBrowser) {
        // Guarded so a quota error never blocks the cloud sync below.
        safeLocalStorageSetItem(APP_ENTRY_COMPLETED_KEY, "true");
      }

      if (reason === "completed") {
        logOnboardingTutorialCompleted({ source: "app_entry" });
      }

      // Sync to cloud (non-blocking)
      this.syncToCloud(reason);
    },

    /**
     * Skip straight to complete (used when user skips create tutorial).
     */
    skipToComplete() {
      this.completeEntry("skipped");
    },

    /**
     * Force replay the entry experience (from Settings).
     */
    replay() {
      state.hasCompleted = false;
      state.phase = "wizard-exiting";
      logOnboardingTutorialAccepted({ source: "manual" });

      setTimeout(() => {
        // Replaying is the opt-in, so go straight to the walkthrough.
        state.phase = "create-tutorial";
      }, 100); // Brief delay for DOM reset
    },

    /**
     * Reset state (for testing/development).
     */
    reset() {
      if (!isBrowser) return;

      state.phase = "wizard-active";
      state.hasCompleted = false;
      state.cloudSynced = false;
      removeLocalStorageItem(APP_ENTRY_COMPLETED_KEY);
    },

    /**
     * Reset cloud-sync flags (call on signout so next signin syncs fresh).
     */
    resetCloudSync() {
      state.cloudSynced = false;
      state.syncInProgress = false;
    },

    /**
     * Mark cloud sync as complete without a read (used when the sync path
     * fails externally, e.g. the dynamic import chain itself throws), so the
     * sync gate isn't left closed forever.
     */
    markCloudSyncComplete() {
      resolveCloudSync();
    },

    /**
     * Sync entry status FROM Firebase.
     * Called after authentication to check if user completed entry on another
     * device. A missing doc means a brand-new account on this device (or the
     * first sign-in before any app-entry write ever landed) - reset to the
     * clean default rather than inheriting a prior account's local
     * "completed" flag (mirrors first-run-state.svelte.ts).
     */
    async syncFromCloud(): Promise<void> {
      if (!isBrowser || state.cloudSynced) return;

      state.syncInProgress = true;

      try {
        const { getFirestoreInstance } =
          await import("#lib/shared/auth/firebase.js");
        const { doc, getDoc } = await import("firebase/firestore");
        const { authState } =
          await import("#lib/shared/auth/state/auth-state.svelte.js");

        const userId = authState.effectiveUserId;
        if (!userId) {
          resolveCloudSync();
          return;
        }

        const firestore = await getFirestoreInstance();
        const docRef = doc(firestore, `users/${userId}/onboarding/appEntry`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().completed === true) {
          state.hasCompleted = true;
          state.phase = "complete";
          safeLocalStorageSetItem(APP_ENTRY_COMPLETED_KEY, "true");
        } else {
          // CRITICAL FIX: no doc, or a doc without completed=true - this
          // account has not finished entry. Reset local state so it doesn't
          // inherit a previous account's completed flag (shared/reused
          // browser). Cloud is authoritative per account, in both directions.
          state.hasCompleted = false;
          state.phase = "wizard-active";
          removeLocalStorageItem(APP_ENTRY_COMPLETED_KEY);
        }

        resolveCloudSync();
      } catch (error) {
        console.warn("[appEntryState] Failed to sync from cloud:", error);
        resolveCloudSync();
      }
    },

    /**
     * Sync entry status TO Firebase.
     */
    async syncToCloud(
      reason: "completed" | "skipped" = "completed"
    ): Promise<void> {
      if (!isBrowser) return;

      try {
        const { getFirestoreInstance } =
          await import("#lib/shared/auth/firebase.js");
        const { doc, writeBatch, serverTimestamp } =
          await import("firebase/firestore");
        const { authState } =
          await import("#lib/shared/auth/state/auth-state.svelte.js");

        // Onboarding belongs to the authenticated account, never an admin
        // preview target. Both terminal documents must use the same owner.
        const userId = authState.user?.uid;
        if (!userId) return;

        const firestore = await getFirestoreInstance();
        const docRef = doc(firestore, `users/${userId}/onboarding/appEntry`);
        const batch = writeBatch(firestore);
        batch.set(
          docRef,
          {
            completed: state.hasCompleted,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // appEntry is the state machine's own resume marker. The app-wide
        // onboarding status is also consumed during auth boot and by the
        // cross-device preferences sync, so keep both existing persistence
        // surfaces in agreement at the terminal transition.
        const { getOnboardingPersister } =
          await import("#lib/shared/onboarding/get-onboarding-persister.js");
        const onboardingPersister = getOnboardingPersister();
        await onboardingPersister.stageAppTerminalState(batch, userId, reason);
        await batch.commit();
      } catch (error) {
        console.warn("[appEntryState] Failed to sync to cloud:", error);
      }
    },
  };
}

// Singleton instance
export const appEntryState = createAppEntryState();
