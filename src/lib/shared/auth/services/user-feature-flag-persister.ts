/**
 * User Feature Flag Persister - Firestore Implementation
 *
 * Persists per-user feature overrides (enabledFeatures, disabledFeatures,
 * moduleOrder) to Firestore at `users/{uid}/settings/featureOverrides`.
 *
 * This replaces the old localStorage-only approach. Now when an admin sets
 * overrides for a user, the user sees them on all devices in real-time.
 *
 * Storage structure:
 *   users/{uid}/settings/featureOverrides {
 *     enabledFeatures: string[],
 *     disabledFeatures: string[],
 *     moduleOrder?: string[],
 *     updatedAt: Timestamp,
 *     updatedBy: string (uid of whoever last changed it)
 *   }
 *
 * Security rules (at users/{userId}/settings/{settingId}):
 *   allow read: if isOwner(userId) || isAdmin()
 *   allow create, update: if isAdmin() && settingId == 'featureOverrides'
 */

import type { Unsubscribe } from "firebase/firestore";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import { isValidFeatureId } from "../domain/models/feature-flag";
import type {
  FeatureId,
  UserFeatureOverrides,
} from "../domain/models/feature-flag";
const LOG_PREFIX = "[UserFeatureFlagPersister]";
const LOCAL_STORAGE_PREFIX = "tka_feature_overrides_";

export class UserFeatureFlagPersister {
  private unsubscribe: Unsubscribe | null = null;

  // Public pages import this class through the feature-flag service, but
  // flags only load after someone signs in. Loading Firebase here, on first
  // use, keeps it off those pages' first download. The import() must name
  // the Firebase modules themselves: the build's small-chunk merge
  // (vite.config.ts) can fold a small wrapper module back into the page.
  private async getDocRef(userId: string) {
    const { doc } = await import("firebase/firestore");
    const { getFirestoreInstance } = await import("../firebase");
    const firestore = await getFirestoreInstance();
    return doc(firestore, `users/${userId}/settings/featureOverrides`);
  }

  // ------------------------------------------------------------------
  // load()
  // ------------------------------------------------------------------

  async load(userId: string): Promise<UserFeatureOverrides> {
    const empty: UserFeatureOverrides = {
      enabledFeatures: [],
      disabledFeatures: [],
      moduleOrder: undefined,
    };

    try {
      const { getDoc } = await import("firebase/firestore");
      const docRef = await this.getDocRef(userId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        const overrides = this.parseFirestoreData(data);

        // Write through to localStorage
        this.writeLocalStorage(userId, overrides);

        return overrides;
      }

      // Firestore doc doesn't exist -- try localStorage migration
      const localOverrides = this.readLocalStorage(userId);
      const hasLocalData =
        localOverrides.enabledFeatures.length > 0 ||
        localOverrides.disabledFeatures.length > 0 ||
        (localOverrides.moduleOrder && localOverrides.moduleOrder.length > 0);

      if (hasLocalData) {
        await this.writeToFirestore(userId, localOverrides);
      }

      return hasLocalData ? localOverrides : empty;
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} Firestore load failed, falling back to localStorage:`,
        error
      );
      return this.readLocalStorage(userId);
    }
  }

  // ------------------------------------------------------------------
  // save()
  // ------------------------------------------------------------------

  async save(userId: string, overrides: UserFeatureOverrides): Promise<void> {
    // Write-through to localStorage immediately
    this.writeLocalStorage(userId, overrides);

    // Write to Firestore
    await this.writeToFirestore(userId, overrides);
  }

  // ------------------------------------------------------------------
  // subscribe()
  // ------------------------------------------------------------------

  subscribe(
    userId: string,
    callback: (overrides: UserFeatureOverrides) => void
  ): void {
    // Clean up previous listener
    this.dispose();

    this.getDocRef(userId)
      .then(async (docRef) => {
        const { onSnapshot } = await import("firebase/firestore");
        this.unsubscribe = onSnapshot(
          docRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const overrides = this.parseFirestoreData(data);

              // Keep localStorage in sync
              this.writeLocalStorage(userId, overrides);

              callback(overrides);
            }
          },
          (error) => {
            console.error(`${LOG_PREFIX} Snapshot listener error:`, error);
          }
        );
      })
      .catch((error) => {
        console.error(
          `${LOG_PREFIX} Failed to set up snapshot listener:`,
          error
        );
      });
  }

  // ------------------------------------------------------------------
  // dispose()
  // ------------------------------------------------------------------

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // ------------------------------------------------------------------
  // Private: Firestore write
  // ------------------------------------------------------------------

  private async writeToFirestore(
    userId: string,
    overrides: UserFeatureOverrides
  ): Promise<void> {
    const { setDoc, serverTimestamp } = await import("firebase/firestore");
    const { auth } = await import("../firebase");
    const docRef = await this.getDocRef(userId);
    const updatedBy = auth.currentUser?.uid ?? "unknown";

    await trackWrite(() =>
      setDoc(
        docRef,
        {
          enabledFeatures: overrides.enabledFeatures,
          disabledFeatures: overrides.disabledFeatures,
          moduleOrder: overrides.moduleOrder ?? null,
          updatedAt: serverTimestamp(),
          updatedBy,
        },
        { merge: true }
      )
    );
  }

  // ------------------------------------------------------------------
  // Private: Parse Firestore document data
  // ------------------------------------------------------------------

  private parseFirestoreData(
    data: Record<string, unknown>
  ): UserFeatureOverrides {
    const enabledFeatures: FeatureId[] = [];
    const disabledFeatures: FeatureId[] = [];

    // Parse enabledFeatures
    if (Array.isArray(data.enabledFeatures)) {
      for (const item of data.enabledFeatures) {
        if (typeof item === "string" && isValidFeatureId(item)) {
          enabledFeatures.push(item);
        }
      }
    }

    // Parse disabledFeatures
    if (Array.isArray(data.disabledFeatures)) {
      for (const item of data.disabledFeatures) {
        if (typeof item === "string" && isValidFeatureId(item)) {
          disabledFeatures.push(item);
        }
      }
    }

    // Parse moduleOrder
    let moduleOrder: string[] | undefined;
    if (Array.isArray(data.moduleOrder)) {
      moduleOrder = data.moduleOrder.filter(
        (item): item is string => typeof item === "string"
      );
      if (moduleOrder.length === 0) {
        moduleOrder = undefined;
      }
    }

    return { enabledFeatures, disabledFeatures, moduleOrder };
  }

  // ------------------------------------------------------------------
  // Private: localStorage read/write (cache layer)
  // ------------------------------------------------------------------

  private readLocalStorage(userId: string): UserFeatureOverrides {
    try {
      const stored = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          enabledFeatures: Array.isArray(parsed.enabledFeatures)
            ? parsed.enabledFeatures
            : [],
          disabledFeatures: Array.isArray(parsed.disabledFeatures)
            ? parsed.disabledFeatures
            : [],
          moduleOrder: Array.isArray(parsed.moduleOrder)
            ? parsed.moduleOrder
            : undefined,
        };
      }
    } catch {
      // Ignore parse errors
    }
    return {
      enabledFeatures: [],
      disabledFeatures: [],
      moduleOrder: undefined,
    };
  }

  private writeLocalStorage(
    userId: string,
    overrides: UserFeatureOverrides
  ): void {
    try {
      localStorage.setItem(
        `${LOCAL_STORAGE_PREFIX}${userId}`,
        JSON.stringify(overrides)
      );
    } catch {
      // localStorage might be full or unavailable
    }
  }
}
