/**
 * First-Run State
 *
 * Manages first-time user onboarding (separate from module onboarding).
 * This is the FIRST experience users see after sign-up - before the module intro.
 *
 * Scope today: a single display-name card for sign-up methods that still use
 * first-run setup. Magic-link completion skips it so the user reaches Create
 * immediately. Accounts that already have a provider name auto-complete with
 * zero UI. Favorite prop and theme/pictograph mode moved to Settings.
 *
 * IMPORTANT: This state syncs with Firebase so returning users on new
 * devices/browsers don't see the wizard again.
 */

import { logOnboardingFirstRunCompleted } from "#lib/shared/analytics/services/onboarding-events.js";
import {
  safeLocalStorageSetItem,
  removeLocalStorageItem,
} from "#lib/shared/foundation/services/storage-manager.js";

const FIRST_RUN_COMPLETED_KEY = "tka-first-run-completed";
const FIRST_RUN_COMPLETED_AT_KEY = "tka-first-run-completed-at";
const FIRST_RUN_SKIPPED_KEY = "tka-first-run-skipped";

interface FirstRunState {
  /** Whether first-run wizard has been completed */
  hasCompleted: boolean;
  /** Whether first-run was skipped */
  wasSkipped: boolean;
  /** When first-run was completed */
  completedAt: Date | null;
  /** Whether to show the first-run wizard */
  shouldShow: boolean;
  /** Whether the wizard is being force-shown as an admin preview (bypasses the
   *  provider-name short-circuit so the card renders even for named accounts) */
  previewMode: boolean;
  /** Whether we've synced with cloud this session */
  cloudSynced: boolean;
  /** Whether we're currently syncing with cloud */
  syncInProgress: boolean;
}

function createFirstRunState() {
  // Check if we're in the browser
  const isBrowser = typeof window !== "undefined";

  // Read initial state from localStorage
  const completed = isBrowser
    ? localStorage.getItem(FIRST_RUN_COMPLETED_KEY) === "true"
    : false;
  const skipped = isBrowser
    ? localStorage.getItem(FIRST_RUN_SKIPPED_KEY) === "true"
    : false;
  const completedAtStr = isBrowser
    ? localStorage.getItem(FIRST_RUN_COMPLETED_AT_KEY)
    : null;
  const completedAt = completedAtStr ? new Date(completedAtStr) : null;

  const state = $state<FirstRunState>({
    hasCompleted: completed,
    wasSkipped: skipped,
    completedAt,
    shouldShow: false, // Controlled by trigger function
    previewMode: false,
    cloudSynced: false,
    syncInProgress: false,
  });

  return {
    get hasCompleted() {
      return state.hasCompleted;
    },
    get wasSkipped() {
      return state.wasSkipped;
    },
    get completedAt() {
      return state.completedAt;
    },
    get shouldShow() {
      return state.shouldShow;
    },
    get previewMode() {
      return state.previewMode;
    },
    get syncInProgress() {
      return state.syncInProgress;
    },
    get cloudSynced() {
      return state.cloudSynced;
    },

    /**
     * Check if this is the user's first time and trigger the wizard.
     * Call this after the app initializes.
     */
    triggerIfFirstTime(): boolean {
      // Don't show if already completed or skipped
      if (state.hasCompleted || state.wasSkipped) {
        return false;
      }

      state.shouldShow = true;
      state.previewMode = false;
      return true;
    },

    /**
     * Force show the first-run wizard (e.g., admin "Preview First Run").
     * Sets previewMode so the wizard renders its card even for accounts that
     * already have a provider display name (which normally auto-completes).
     */
    forceShow() {
      state.shouldShow = true;
      state.previewMode = true;
    },

    /**
     * Mark first-run as completed
     */
    markCompleted() {
      if (!isBrowser) return;

      // Capture before this function flips it off below - an admin's "Preview
      // First Run" run must not pollute real onboarding funnel analytics.
      const wasPreview = state.previewMode;

      const now = new Date();
      state.hasCompleted = true;
      state.completedAt = now;
      state.shouldShow = false;
      state.previewMode = false;

      // Guarded so a full/private-browsing localStorage quota error never
      // blocks the cloud sync below (see safeLocalStorageSetItem).
      safeLocalStorageSetItem(FIRST_RUN_COMPLETED_KEY, "true");
      safeLocalStorageSetItem(FIRST_RUN_COMPLETED_AT_KEY, now.toISOString());

      if (!wasPreview) {
        logOnboardingFirstRunCompleted({ source: "app_entry" });
      }

      // Sync to cloud (non-blocking)
      this.syncToCloud();
    },

    /**
     * Mark first-run as skipped. Auth completion can pass the newly signed-in
     * uid so the cloud write cannot race the reactive auth wrapper.
     */
    markSkipped(userId?: string) {
      if (!isBrowser) return;

      // A shared browser may still carry the previous account's completed
      // flag. The magic-link decision belongs to the newly signed-in uid, so
      // write one unambiguous state instead of persisting both outcomes.
      state.hasCompleted = false;
      state.wasSkipped = true;
      state.completedAt = null;
      state.shouldShow = false;
      state.previewMode = false;

      removeLocalStorageItem(FIRST_RUN_COMPLETED_KEY);
      removeLocalStorageItem(FIRST_RUN_COMPLETED_AT_KEY);
      safeLocalStorageSetItem(FIRST_RUN_SKIPPED_KEY, "true");

      // Sync to cloud (non-blocking)
      this.syncToCloud(userId);
    },

    /**
     * Hide the wizard without marking complete (temporary dismiss)
     */
    hide() {
      state.shouldShow = false;
      state.previewMode = false;
    },

    /**
     * Reset first-run state (for testing/development)
     */
    reset() {
      if (!isBrowser) return;

      state.hasCompleted = false;
      state.wasSkipped = false;
      state.completedAt = null;
      state.shouldShow = false;
      state.previewMode = false;
      state.cloudSynced = false;

      removeLocalStorageItem(FIRST_RUN_COMPLETED_KEY);
      removeLocalStorageItem(FIRST_RUN_COMPLETED_AT_KEY);
      removeLocalStorageItem(FIRST_RUN_SKIPPED_KEY);
    },

    /**
     * Reset cloud sync state (call on signout so next signin syncs fresh)
     */
    resetCloudSync() {
      state.cloudSynced = false;
      state.syncInProgress = false;
    },

    /**
     * Mark cloud sync as complete (call when sync fails externally)
     * This prevents the UI from getting stuck on "Loading preferences..." forever
     * when Firebase/network errors occur before syncFromCloud() is called.
     */
    markCloudSyncComplete() {
      state.cloudSynced = true;
      state.syncInProgress = false;
    },

    /**
     * Check if first-run has been done (completed or skipped)
     */
    isDone(): boolean {
      return state.hasCompleted || state.wasSkipped;
    },

    /**
     * Sync first-run status FROM Firebase.
     * Call this when a user authenticates to check if they've completed
     * first-run on another device.
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
          state.syncInProgress = false;
          return;
        }

        const firestore = await getFirestoreInstance();
        const docRef = doc(firestore, `users/${userId}/onboarding/firstRun`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.completed || data.skipped) {
            // User has completed first-run on another device
            state.hasCompleted = data.completed ?? false;
            state.wasSkipped = data.skipped ?? false;
            state.completedAt = data.completedAt
              ? new Date(data.completedAt)
              : null;

            // Also update localStorage for consistency
            if (data.completed) {
              safeLocalStorageSetItem(FIRST_RUN_COMPLETED_KEY, "true");
            }
            if (data.skipped) {
              safeLocalStorageSetItem(FIRST_RUN_SKIPPED_KEY, "true");
            }
            if (data.completedAt) {
              safeLocalStorageSetItem(
                FIRST_RUN_COMPLETED_AT_KEY,
                data.completedAt
              );
            }
          }
        } else {
          // CRITICAL FIX: Document doesn't exist - this is a brand new user!
          // We must RESET local state to prevent inheriting previous user's first-run status
          // (happens when multiple users share the same browser)
          state.hasCompleted = false;
          state.wasSkipped = false;
          state.completedAt = null;

          // Clear localStorage to match
          removeLocalStorageItem(FIRST_RUN_COMPLETED_KEY);
          removeLocalStorageItem(FIRST_RUN_COMPLETED_AT_KEY);
          removeLocalStorageItem(FIRST_RUN_SKIPPED_KEY);

          // Also clear the module cache so new users start on default module (create)
          // instead of inheriting previous user's last-visited module
          removeLocalStorageItem("tka-active-module-cache");
        }

        state.cloudSynced = true;
      } catch (error) {
        console.warn("⚠️ [firstRunState] Failed to sync from cloud:", error);
        // Mark as synced even on failure to avoid getting stuck in loading state
        // localStorage fallback will be used
        state.cloudSynced = true;
      } finally {
        state.syncInProgress = false;
      }
    },

    /**
     * Sync first-run status TO Firebase.
     * Called automatically when marking complete/skipped.
     */
    async syncToCloud(userIdOverride?: string): Promise<void> {
      if (!isBrowser) return;

      // Freeze the decision before the first await. Auth boot can finish a
      // missing-document read while this write is loading Firestore; reading
      // the live runes afterward could otherwise turn a just-recorded skip
      // back into `false` in the cloud payload.
      const snapshot = {
        completed: state.hasCompleted,
        skipped: state.wasSkipped,
        completedAt: state.completedAt?.toISOString() ?? null,
      };

      try {
        const { getFirestoreInstance } =
          await import("#lib/shared/auth/firebase.js");
        const { doc, setDoc, serverTimestamp } =
          await import("firebase/firestore");
        const { authState } =
          await import("#lib/shared/auth/state/auth-state.svelte.js");

        const userId = userIdOverride || authState.effectiveUserId;
        if (!userId) return;

        const firestore = await getFirestoreInstance();
        const docRef = doc(firestore, `users/${userId}/onboarding/firstRun`);

        await setDoc(
          docRef,
          {
            ...snapshot,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.warn("⚠️ [firstRunState] Failed to sync to cloud:", error);
        // Don't throw - localStorage still works as fallback
      }
    },
  };
}

// Singleton instance
export const firstRunState = createFirstRunState();
