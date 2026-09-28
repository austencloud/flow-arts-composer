/**
 * Global Feature Flag Persister - Firestore Implementation
 *
 * Persists admin-set global feature flag overrides (enabled toggles and
 * minimum role requirements) to Firestore at `config/featureFlags`.
 *
 * This replaces the old localStorage-only approach, which meant overrides
 * only existed on the admin's browser. Now all clients receive overrides
 * in real-time via onSnapshot.
 *
 * Storage structure:
 *   config/featureFlags {
 *     globalFlagOverrides: Record<string, boolean>,
 *     globalRoleOverrides: Record<string, UserRole>,
 *     updatedAt: Timestamp,
 *     updatedBy: string (uid)
 *   }
 *
 * Security rules (already deployed):
 *   allow read: if isAuthenticated()
 *   allow write: if isAdmin()
 *
 * Offline resilience:
 *   - localStorage is used as a write-through cache
 *   - On load, Firestore is tried first; localStorage is the fallback
 *   - On save, both Firestore and localStorage are written
 */

import type { Unsubscribe } from "firebase/firestore";
import { trackWrite } from "$lib/shared/offline/state/sync-status-state.svelte";
import { isValidUserRole } from "../domain/models/feature-flag";
import type { UserRole } from "../domain/models/user-role";
import type { GlobalFlagOverrides } from "./types";

const LOG_PREFIX = "[GlobalFeatureFlagPersister]";
const FIRESTORE_DOC_PATH = "config/featureFlags";

// localStorage keys (kept for write-through cache and migration)
const LOCAL_FLAG_OVERRIDES_KEY = "tka-global-flag-overrides";
const LOCAL_ROLE_OVERRIDES_KEY = "tka-global-role-overrides";

export class GlobalFeatureFlagPersister {
  private unsubscribe: Unsubscribe | null = null;

  // Public pages import this class through the feature-flag service, but
  // flags only load after someone signs in. Loading Firebase here, on first
  // use, keeps it off those pages' first download. The import() must name
  // the Firebase modules themselves: the build's small-chunk merge
  // (vite.config.ts) can fold a small wrapper module back into the page.
  private async getDocRef() {
    const { doc } = await import("firebase/firestore");
    const { getFirestoreInstance } = await import("../firebase");
    const firestore = await getFirestoreInstance();
    return doc(firestore, FIRESTORE_DOC_PATH);
  }

  // load()

  async load(): Promise<GlobalFlagOverrides> {
    try {
      const { getDoc } = await import("firebase/firestore");
      const docRef = await this.getDocRef();
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        const overrides = this.parseFirestoreData(data);

        // Write through to localStorage so offline loads have fresh data
        this.writeLocalStorage(overrides);

        // Migration: if Firestore had data, we're done
        return overrides;
      }

      // Firestore doc doesn't exist yet -- try localStorage migration
      const localOverrides = this.readLocalStorage();
      const hasLocalData =
        Object.keys(localOverrides.globalFlagOverrides).length > 0 ||
        Object.keys(localOverrides.globalRoleOverrides).length > 0;

      if (hasLocalData) {
        // Migrate localStorage data to Firestore (one-time)
        await this.writeToFirestore(localOverrides);
      }

      return localOverrides;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Firestore load failed, falling back to localStorage:`, error);
      return this.readLocalStorage();
    }
  }

  // ------------------------------------------------------------------
  // save()
  // ------------------------------------------------------------------

  async save(overrides: GlobalFlagOverrides): Promise<void> {
    // Write-through to localStorage immediately (offline resilience)
    this.writeLocalStorage(overrides);

    // Write to Firestore
    await this.writeToFirestore(overrides);
  }

  // ------------------------------------------------------------------
  // subscribe()
  // ------------------------------------------------------------------

  subscribe(callback: (overrides: GlobalFlagOverrides) => void): void {
    // Clean up previous listener
    this.dispose();

    this.getDocRef()
      .then(async (docRef) => {
        const { onSnapshot } = await import("firebase/firestore");
        this.unsubscribe = onSnapshot(
          docRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const overrides = this.parseFirestoreData(data);

              // Keep localStorage in sync
              this.writeLocalStorage(overrides);

              callback(overrides);
            }
          },
          (error) => {
            console.error(`${LOG_PREFIX} Snapshot listener error:`, error);
          }
        );
      })
      .catch((error) => {
        console.error(`${LOG_PREFIX} Failed to set up snapshot listener:`, error);
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

  private async writeToFirestore(overrides: GlobalFlagOverrides): Promise<void> {
    const { setDoc, serverTimestamp } = await import("firebase/firestore");
    const { auth } = await import("../firebase");
    const docRef = await this.getDocRef();
    const uid = auth.currentUser?.uid ?? "unknown";

    await trackWrite(() =>
      setDoc(
        docRef,
        {
          globalFlagOverrides: overrides.globalFlagOverrides,
          globalRoleOverrides: overrides.globalRoleOverrides,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
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
  ): GlobalFlagOverrides {
    const flagOverrides: Record<string, boolean> = {};
    const roleOverrides: Record<string, UserRole> = {};

    // Parse globalFlagOverrides
    const rawFlags = data.globalFlagOverrides;
    if (typeof rawFlags === "object" && rawFlags !== null) {
      for (const [key, value] of Object.entries(
        rawFlags as Record<string, unknown>
      )) {
        if (typeof key === "string" && typeof value === "boolean") {
          flagOverrides[key] = value;
        }
      }
    }

    // Parse globalRoleOverrides
    const rawRoles = data.globalRoleOverrides;
    if (typeof rawRoles === "object" && rawRoles !== null) {
      for (const [key, value] of Object.entries(
        rawRoles as Record<string, unknown>
      )) {
        if (typeof key === "string" && isValidUserRole(value)) {
          roleOverrides[key] = value as UserRole;
        }
      }
    }

    return {
      globalFlagOverrides: flagOverrides,
      globalRoleOverrides: roleOverrides,
    };
  }

  // ------------------------------------------------------------------
  // Private: localStorage read/write (cache layer)
  // ------------------------------------------------------------------

  private readLocalStorage(): GlobalFlagOverrides {
    const flagOverrides: Record<string, boolean> = {};
    const roleOverrides: Record<string, UserRole> = {};

    try {
      const flagsRaw = localStorage.getItem(LOCAL_FLAG_OVERRIDES_KEY);
      if (flagsRaw) {
        const parsed = JSON.parse(flagsRaw);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof key === "string" && typeof value === "boolean") {
              flagOverrides[key] = value;
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    try {
      const rolesRaw = localStorage.getItem(LOCAL_ROLE_OVERRIDES_KEY);
      if (rolesRaw) {
        const parsed = JSON.parse(rolesRaw);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof key === "string" && isValidUserRole(value)) {
              roleOverrides[key] = value as UserRole;
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    return { globalFlagOverrides: flagOverrides, globalRoleOverrides: roleOverrides };
  }

  private writeLocalStorage(overrides: GlobalFlagOverrides): void {
    try {
      localStorage.setItem(
        LOCAL_FLAG_OVERRIDES_KEY,
        JSON.stringify(overrides.globalFlagOverrides)
      );
      localStorage.setItem(
        LOCAL_ROLE_OVERRIDES_KEY,
        JSON.stringify(overrides.globalRoleOverrides)
      );
    } catch {
      // localStorage might be full or unavailable
    }
  }
}
