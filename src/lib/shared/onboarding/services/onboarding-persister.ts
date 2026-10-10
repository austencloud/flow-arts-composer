/**
 * OnboardingPersister
 *
 * Persists onboarding completion status to Firebase for authenticated users.
 * Falls back to localStorage for anonymous users.
 * Syncs local progress to cloud on authentication.
 *
 * Scope: app-wide completion/skip status, profile setup progress and reminder
 * policy, and the What's New "last seen version" high-water mark. There is no
 * per-module or per-tab tracking.
 * The per-module surface (a `modules` sub-object keyed by module id) was
 * removed 2026-07-19 as dead code; it served the deprecated
 * `ModuleOnboarding.svelte` carousel. Its planned replacement,
 * `TabIntro.svelte`'s local-only per-tab dismissal, was never adopted by any
 * tab and was itself deleted 2026-07-19 (see onboarding/README.md).
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
  type WriteBatch,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import type { OnboardingStatus } from "./types";
import { compareVersions } from "#lib/shared/versioning/domain/models/version-models.js";
import {
  ACCOUNT_SETUP_PROGRESS_KEY,
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_COMPLETED_AT_KEY,
  ONBOARDING_SKIPPED_KEY,
  VIEWER3D_INTRO_SEEN_KEY,
  SCENE_STUDIO_SETUP_SEEN_KEY,
} from "../config/storage-keys";
import {
  createDefaultAccountSetupProgress,
  isSameAccountSetupProgress,
  mergeAccountSetupProgress,
  normalizeAccountSetupProgress,
} from "../domain/account-setup-progress";
import {
  safeLocalStorageSetItem,
  removeLocalStorageItem,
} from "#lib/shared/foundation/services/storage-manager.js";

const LAST_SEEN_VERSION_KEY = "tka-last-seen-version";

/**
 * Whether two statuses hold the same progress. The record type makes a field
 * added to OnboardingStatus fail to compile until it is compared here, because
 * a field left out would silently stop syncing to the cloud.
 */
function isSameStatus(
  left: OnboardingStatus,
  right: OnboardingStatus
): boolean {
  const sameField: Record<keyof OnboardingStatus, boolean> = {
    appCompleted: left.appCompleted === right.appCompleted,
    appSkipped: left.appSkipped === right.appSkipped,
    appCompletedAt: left.appCompletedAt === right.appCompletedAt,
    lastSeenVersion: left.lastSeenVersion === right.lastSeenVersion,
    viewer3DIntroSeen: left.viewer3DIntroSeen === right.viewer3DIntroSeen,
    sceneStudioSetupSeen:
      left.sceneStudioSetupSeen === right.sceneStudioSetupSeen,
    accountSetup: isSameAccountSetupProgress(
      left.accountSetup,
      right.accountSetup
    ),
  };
  return Object.values(sameField).every(Boolean);
}

export class OnboardingPersister {
  private cachedStatus: OnboardingStatus | null = null;
  private unsubscribe: Unsubscribe | null = null;

  /**
   * Get the Firestore document reference for onboarding status
   * NOTE: Uses the actual authenticated user's ID (not effectiveUserId)
   * because onboarding status should always be for the current user,
   * not a previewed user during admin preview mode.
   */
  private async getOnboardingDocRef() {
    // Use the actual user ID, not effectiveUserId, to avoid permission errors
    // when admin is in preview mode viewing another user's data
    const userId = authState.user?.uid;
    if (!userId) {
      return null;
    }
    const firestore = await getFirestoreInstance();
    return doc(firestore, `users/${userId}/onboarding/status`);
  }

  /**
   * Create default empty onboarding status
   */
  private createDefaultStatus(): OnboardingStatus {
    return {
      appCompleted: false,
      appSkipped: false,
      appCompletedAt: null,
      lastSeenVersion: null,
      viewer3DIntroSeen: false,
      sceneStudioSetupSeen: false,
      accountSetup: createDefaultAccountSetupProgress(),
    };
  }

  /**
   * The status a cloud document stands for, with defaults for any field the
   * document predates.
   */
  private statusFromCloud(data: Partial<OnboardingStatus>): OnboardingStatus {
    const status = this.createDefaultStatus();
    status.appCompleted = data.appCompleted ?? false;
    status.appSkipped = data.appSkipped ?? false;
    status.appCompletedAt = data.appCompletedAt ?? null;
    status.lastSeenVersion = data.lastSeenVersion ?? null;
    status.viewer3DIntroSeen = data.viewer3DIntroSeen ?? false;
    status.sceneStudioSetupSeen = data.sceneStudioSetupSeen ?? false;
    status.accountSetup = normalizeAccountSetupProgress(data.accountSetup);
    return status;
  }

  /**
   * Load status from localStorage (for anonymous users or as fallback)
   */
  private loadFromLocalStorage(): OnboardingStatus {
    if (typeof localStorage === "undefined") {
      return this.createDefaultStatus();
    }

    const appCompleted =
      localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true";
    const appSkipped = localStorage.getItem(ONBOARDING_SKIPPED_KEY) === "true";
    const appCompletedAt =
      localStorage.getItem(ONBOARDING_COMPLETED_AT_KEY) || null;

    // Last seen version
    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY) || null;
    const viewer3DIntroSeen =
      localStorage.getItem(VIEWER3D_INTRO_SEEN_KEY) === "true";
    const sceneStudioSetupSeen =
      localStorage.getItem(SCENE_STUDIO_SETUP_SEEN_KEY) === "true";

    let accountSetup = createDefaultAccountSetupProgress();
    const storedAccountSetup = localStorage.getItem(ACCOUNT_SETUP_PROGRESS_KEY);
    if (storedAccountSetup) {
      try {
        accountSetup = normalizeAccountSetupProgress(
          JSON.parse(storedAccountSetup)
        );
      } catch {
        // A partial or damaged local value should never block application entry.
      }
    }

    return {
      appCompleted,
      appSkipped,
      appCompletedAt,
      lastSeenVersion,
      viewer3DIntroSeen,
      sceneStudioSetupSeen,
      accountSetup,
    };
  }

  /**
   * Save status to localStorage
   */
  private saveToLocalStorage(status: OnboardingStatus): void {
    if (typeof localStorage === "undefined") return;

    // Every write below is guarded (safeLocalStorageSetItem/removeLocalStorageItem
    // swallow a quota/private-browsing throw) so a full local store can never
    // abort this method partway through and skip the Firebase write that
    // saveStatus() makes right after calling it.
    // App-wide
    if (status.appCompleted) {
      safeLocalStorageSetItem(ONBOARDING_COMPLETED_KEY, "true");
    } else {
      removeLocalStorageItem(ONBOARDING_COMPLETED_KEY);
    }

    if (status.appSkipped) {
      safeLocalStorageSetItem(ONBOARDING_SKIPPED_KEY, "true");
    } else {
      removeLocalStorageItem(ONBOARDING_SKIPPED_KEY);
    }

    if (status.appCompletedAt) {
      safeLocalStorageSetItem(
        ONBOARDING_COMPLETED_AT_KEY,
        status.appCompletedAt
      );
    } else {
      removeLocalStorageItem(ONBOARDING_COMPLETED_AT_KEY);
    }

    // Last seen version
    if (status.lastSeenVersion) {
      safeLocalStorageSetItem(LAST_SEEN_VERSION_KEY, status.lastSeenVersion);
    } else {
      removeLocalStorageItem(LAST_SEEN_VERSION_KEY);
    }

    if (status.viewer3DIntroSeen) {
      safeLocalStorageSetItem(VIEWER3D_INTRO_SEEN_KEY, "true");
    } else {
      removeLocalStorageItem(VIEWER3D_INTRO_SEEN_KEY);
    }

    if (status.sceneStudioSetupSeen) {
      safeLocalStorageSetItem(SCENE_STUDIO_SETUP_SEEN_KEY, "true");
    } else {
      removeLocalStorageItem(SCENE_STUDIO_SETUP_SEEN_KEY);
    }

    safeLocalStorageSetItem(
      ACCOUNT_SETUP_PROGRESS_KEY,
      JSON.stringify(normalizeAccountSetupProgress(status.accountSetup))
    );
  }

  /**
   * Load onboarding status from Firebase or localStorage
   */
  async loadStatus(): Promise<OnboardingStatus> {
    const docRef = await this.getOnboardingDocRef();

    // Not authenticated - use localStorage
    if (!docRef) {
      this.cachedStatus = this.loadFromLocalStorage();
      return this.cachedStatus;
    }

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const status = this.statusFromCloud(
          docSnap.data() as Partial<OnboardingStatus>
        );

        this.cachedStatus = status;
        // Also sync to localStorage for fast access
        this.saveToLocalStorage(status);
        return status;
      }

      // No cloud data - use localStorage and sync to cloud
      this.cachedStatus = this.loadFromLocalStorage();
      await this.saveStatus(this.cachedStatus);
      return this.cachedStatus;
    } catch (error) {
      console.error(
        "❌ [OnboardingPersister] Failed to load from Firebase:",
        error
      );
      // Fall back to localStorage
      this.cachedStatus = this.loadFromLocalStorage();
      return this.cachedStatus;
    }
  }

  /**
   * Save onboarding status to Firebase and localStorage
   */
  async saveStatus(status: OnboardingStatus): Promise<void> {
    // Always save to localStorage for fast access
    this.saveToLocalStorage(status);
    this.cachedStatus = status;

    const docRef = await this.getOnboardingDocRef();
    if (!docRef) {
      // Not authenticated - localStorage only
      return;
    }

    const cloudStatus = {
      ...status,
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(docRef, cloudStatus, { merge: true });
    } catch (error) {
      console.error(
        "❌ [OnboardingPersister] Failed to save to Firebase:",
        error
      );
      // Don't throw - localStorage is still updated
    }
  }

  /**
   * Check if app-wide onboarding is completed
   */
  hasCompletedApp(): boolean {
    if (this.cachedStatus) {
      return this.cachedStatus.appCompleted || this.cachedStatus.appSkipped;
    }

    if (typeof localStorage === "undefined") return false;
    return (
      localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true" ||
      localStorage.getItem(ONBOARDING_SKIPPED_KEY) === "true"
    );
  }

  /**
   * Mark app-wide onboarding as completed
   */
  async markAppCompleted(): Promise<void> {
    const status = this.cachedStatus || (await this.loadStatus());
    status.appCompleted = true;
    status.appSkipped = false;
    status.appCompletedAt = new Date().toISOString();
    await this.saveStatus(status);
  }

  /**
   * Mark app-wide onboarding as skipped
   */
  async markAppSkipped(): Promise<void> {
    const status = this.cachedStatus || (await this.loadStatus());
    status.appCompleted = false;
    status.appSkipped = true;
    status.appCompletedAt = null;
    await this.saveStatus(status);
  }

  /**
   * Mark the first-open 3D viewer introduction as seen.
   */
  async markViewer3DIntroSeen(): Promise<void> {
    const status = this.cachedStatus || (await this.loadStatus());
    status.viewer3DIntroSeen = true;
    await this.saveStatus(status);
  }

  /**
   * Mark the 3D Studio's first-run guided scene setup as seen. Separate from
   * the viewer's pointer: dismissing a hint is not the same as having been
   * walked through building a scene.
   */
  async markSceneStudioSetupSeen(): Promise<void> {
    const status = this.cachedStatus || (await this.loadStatus());
    status.sceneStudioSetupSeen = true;
    await this.saveStatus(status);
  }

  /**
   * Stage app-entry's terminal marker and the app-wide status in the caller's
   * batch. The explicit user ID prevents an auth or admin-preview change from
   * splitting the two documents across accounts.
   */
  async stageAppTerminalState(
    batch: WriteBatch,
    userId: string,
    reason: "completed" | "declined" | "skipped"
  ): Promise<void> {
    const previous = this.cachedStatus ?? this.loadFromLocalStorage();
    const appCompleted = reason === "completed";
    const appCompletedAt = appCompleted ? new Date().toISOString() : null;
    const status: OnboardingStatus = {
      ...previous,
      appCompleted,
      appSkipped: !appCompleted,
      appCompletedAt,
    };

    this.saveToLocalStorage(status);
    this.cachedStatus = status;

    const firestore = await getFirestoreInstance();
    batch.set(
      doc(firestore, `users/${userId}/onboarding/status`),
      {
        appCompleted,
        appSkipped: !appCompleted,
        appCompletedAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /**
   * Subscribe to real-time updates
   */
  async subscribe(
    callback: (status: OnboardingStatus) => void
  ): Promise<() => void> {
    const docRef = await this.getOnboardingDocRef();
    if (!docRef) {
      // Not authenticated - just return current status
      callback(this.cachedStatus || this.loadFromLocalStorage());
      return () => {};
    }

    this.unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const status = this.statusFromCloud(
            docSnap.data() as Partial<OnboardingStatus>
          );

          this.cachedStatus = status;
          this.saveToLocalStorage(status);
          callback(status);
        }
      },
      (error) => {
        console.error("❌ [OnboardingPersister] Subscription error:", error);
      }
    );

    return () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
  }

  /**
   * Sync localStorage to Firebase when user authenticates
   */
  async syncLocalToCloud(): Promise<void> {
    const docRef = await this.getOnboardingDocRef();
    if (!docRef) return;

    const localStatus = this.loadFromLocalStorage();

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        // Merge: keep most complete state. The cloud copy is read with
        // defaults for fields it predates: a missing field would otherwise
        // merge to undefined, which setDoc rejects outright.
        const cloudStatus = this.statusFromCloud(
          docSnap.data() as Partial<OnboardingStatus>
        );
        const mergedStatus = this.createDefaultStatus();

        // App-wide: prefer completed/skipped
        mergedStatus.appCompleted =
          localStatus.appCompleted || cloudStatus.appCompleted;
        mergedStatus.appSkipped =
          localStatus.appSkipped || cloudStatus.appSkipped;
        mergedStatus.appCompletedAt =
          localStatus.appCompletedAt || cloudStatus.appCompletedAt || null;
        mergedStatus.viewer3DIntroSeen =
          localStatus.viewer3DIntroSeen || cloudStatus.viewer3DIntroSeen;
        mergedStatus.sceneStudioSetupSeen =
          localStatus.sceneStudioSetupSeen || cloudStatus.sceneStudioSetupSeen;

        // Last seen version: keep the higher one (numeric semver compare, so
        // "0.10.0" correctly beats "0.9.0" — a plain string compare gets this
        // backwards).
        const localVersion = localStatus.lastSeenVersion;
        const cloudVersion = cloudStatus.lastSeenVersion;
        if (localVersion && cloudVersion) {
          mergedStatus.lastSeenVersion =
            compareVersions(localVersion, cloudVersion) >= 0
              ? localVersion
              : cloudVersion;
        } else {
          mergedStatus.lastSeenVersion = localVersion || cloudVersion || null;
        }

        mergedStatus.accountSetup = mergeAccountSetupProgress(
          localStatus.accountSetup,
          cloudStatus.accountSetup
        );

        // This runs on every signed-in page load. When this browser knows
        // nothing the cloud copy lacks, only this browser needs updating;
        // saving anyway billed a write per visit just to move updatedAt.
        if (isSameStatus(mergedStatus, cloudStatus)) {
          this.saveToLocalStorage(mergedStatus);
          this.cachedStatus = mergedStatus;
        } else {
          await this.saveStatus(mergedStatus);
        }
      } else {
        // No cloud data - push local to cloud
        await this.saveStatus(localStatus);
      }
    } catch (error) {
      console.error("❌ [OnboardingPersister] Failed to sync:", error);
    }
  }

  // ===========================================================================
  // What's New Version Tracking Methods
  // ===========================================================================

  /**
   * Check if user has seen the given version in What's New.
   *
   * High-water-mark semantics: a user who has already seen version N has
   * implicitly seen everything <= N. Using `>=` (not `===`) means a stale
   * build (e.g. a dev server whose baked __APP_VERSION__ lags the deployed
   * one) won't re-show notes the user already dismissed on a newer surface.
   */
  hasSeenVersion(version: string): boolean {
    const lastSeen = this.cachedStatus
      ? this.cachedStatus.lastSeenVersion
      : typeof localStorage !== "undefined"
        ? localStorage.getItem(LAST_SEEN_VERSION_KEY)
        : // No cache and no localStorage (SSR) — treat as seen to avoid flashing.
          version;

    if (!lastSeen) return false;
    return compareVersions(lastSeen, version) >= 0;
  }

  /**
   * Mark a version as seen in What's New.
   *
   * Stores the high-water mark — never downgrades a higher seen version to a
   * lower one (prevents a stale older build from clobbering a newer surface's
   * progress and re-triggering the modal on both).
   */
  async markVersionAsSeen(version: string): Promise<void> {
    const status = this.cachedStatus || (await this.loadStatus());
    const current = status.lastSeenVersion;
    if (!current || compareVersions(version, current) > 0) {
      status.lastSeenVersion = version;
      await this.saveStatus(status);
    }
  }

  /**
   * Get the last seen version (for debugging/display).
   */
  getLastSeenVersion(): string | null {
    if (this.cachedStatus) {
      return this.cachedStatus.lastSeenVersion;
    }

    // Fall back to localStorage
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(LAST_SEEN_VERSION_KEY);
  }
}
