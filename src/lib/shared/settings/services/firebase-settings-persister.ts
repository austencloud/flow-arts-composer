/**
 * Firebase Settings Persistence Service
 *
 * Persists user settings to Firestore for authenticated users.
 * Provides real-time sync across devices and tabs.
 *
 * Storage structure:
 * - users/{uid}/settings (document containing all app settings)
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, getFirestoreInstance } from "../../auth/firebase";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { isPermissionDeniedError } from "$lib/shared/auth/utils/is-permission-denied-error";
import { trackWrite } from "$lib/shared/offline/state/sync-status-state.svelte";
import {
  normalizeLegacyAppSettings,
  type AppSettings,
} from "../domain/app-settings";

export class FirebaseSettingsPersister {
  // Cancels whichever subscription attempt is current. Each onSettingsChange
  // call owns its own handle; this only exists so a new call still replaces
  // the previous one.
  private cancelActiveSubscription: (() => void) | null = null;

  // Last activeProp mirrored to the user doc this session — skips redundant
  // writes when a settings save didn't change the prop. Scoped to the owner:
  // an unscoped cache would suppress the mirror for the next account.
  private lastMirroredActiveProp: { userId: string; activeProp: string } | null =
    null;

  /**
   * Get the Firestore document reference for user settings
   * Note: Uses actual user ID, not effective (preview) user ID
   */
  private async getSettingsDocRef() {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return null;
    }
    const firestore = await getFirestoreInstance();
    return doc(firestore, `users/${userId}/settings/preferences`);
  }

  /**
   * Load settings from Firestore
   */
  async loadSettings(): Promise<AppSettings | null> {
    const docRef = await this.getSettingsDocRef();
    if (!docRef) {
      return null;
    }

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Remove Firestore metadata fields

        const {
          updatedAt: _updatedAt,
          createdAt: _createdAt,
          ...settings
        } = data;
        return normalizeLegacyAppSettings(settings);
      }
      return null;
    } catch (error) {
      console.error(
        "❌ [FirebaseSettingsPersister] Failed to load settings:",
        error
      );
      return null;
    }
  }

  /**
   * Save settings to Firestore
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    // Captured before any await, so the whole save — including the activeProp
    // mirror that runs after the settings write — is pinned to the account
    // this write belongs to.
    const ownerId = auth.currentUser?.uid;
    const docRef = await this.getSettingsDocRef();
    if (!docRef || !ownerId) {
      console.warn(
        "⚠️ [FirebaseSettingsPersister] Cannot save: No authenticated user"
      );
      return;
    }

    try {
      await trackWrite(() =>
        setDoc(
          docRef,
          {
            ...settings,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      );
    } catch (error) {
      console.error(
        "❌ [FirebaseSettingsPersister] Failed to save settings:",
        error
      );
      toast.error("Failed to save settings.");
      throw error;
    }

    await this.mirrorActiveProp(settings, ownerId);
  }

  /**
   * Mirror the selected prop onto users/{uid}.activeProp so the publicly
   * readable user doc carries the creator's prop identity (browse creators
   * queries can't reach the settings subcollection). The left hand is the
   * tiebreaker; in practice both hands match. Non-fatal: a failed mirror
   * leaves a stale badge, not broken settings.
   */
  private async mirrorActiveProp(
    settings: AppSettings,
    ownerId: string
  ): Promise<void> {
    const activeProp = settings.leftPropType;
    if (!activeProp) return;
    if (
      this.lastMirroredActiveProp?.userId === ownerId &&
      this.lastMirroredActiveProp.activeProp === activeProp
    ) {
      return;
    }

    const user = auth.currentUser;
    if (!user) return;
    // The settings write above was awaited, so the account can have changed
    // since. Mirroring now would stamp this payload's prop onto whoever is
    // signed in instead of the account the settings belong to.
    if (user.uid !== ownerId) return;
    // Guests are excluded from Browse Creators, so the badge is useless for
    // them — and this merge write would MINT a skeleton users/{uid} doc
    // (activeProp only, no displayName) whenever the real doc doesn't exist
    // (anonymous dev sessions skip doc creation). Those skeletons render as
    // "Unknown" in the admin users tab.
    if (user.isAnonymous) return;

    try {
      const firestore = await getFirestoreInstance();
      // Re-check: awaiting the Firestore instance is another chance for the
      // account to change under this write.
      if (auth.currentUser?.uid !== ownerId) return;
      await trackWrite(() =>
        setDoc(
          doc(firestore, `users/${ownerId}`),
          { activeProp },
          { merge: true }
        )
      );
      this.lastMirroredActiveProp = { userId: ownerId, activeProp };
    } catch (error) {
      console.error(
        "❌ [FirebaseSettingsPersister] Failed to mirror activeProp:",
        error
      );
    }
  }

  /**
   * Clear settings from Firestore
   */
  async clearSettings(): Promise<void> {
    const docRef = await this.getSettingsDocRef();
    if (!docRef) {
      return;
    }

    try {
      // Set to empty object with timestamp to preserve document
      await trackWrite(() =>
        setDoc(docRef, {
          clearedAt: serverTimestamp(),
        })
      );
    } catch (error) {
      console.error(
        "❌ [FirebaseSettingsPersister] Failed to clear settings:",
        error
      );
      toast.error("Failed to clear settings.");
      throw error;
    }
  }

  /**
   * Check if settings exist in Firestore
   */
  async hasSettings(): Promise<boolean> {
    const docRef = await this.getSettingsDocRef();
    if (!docRef) {
      return false;
    }

    try {
      const docSnap = await getDoc(docRef);
      return docSnap.exists() && Object.keys(docSnap.data() || {}).length > 1; // More than just timestamps
    } catch (error) {
      console.error(
        "❌ [FirebaseSettingsPersister] Failed to check settings:",
        error
      );
      return false;
    }
  }

  /**
   * Subscribe to real-time settings changes from Firestore
   * This enables cross-device sync
   */
  onSettingsChange(callback: (settings: AppSettings) => void): () => void {
    // Clean up any existing subscription
    this.cancelActiveSubscription?.();

    // The snapshot listener is created AFTER an await, so a caller that
    // unsubscribes while the doc ref is still resolving would otherwise leave
    // this method to open a live listener no one holds a handle to. `cancelled`
    // is what the pending creation checks; `active` is this call's own handle,
    // never a shared field, so two calls cannot cancel each other's listener.
    let cancelled = false;
    let active: Unsubscribe | null = null;

    const cancel = () => {
      cancelled = true;
      if (active) {
        active();
        active = null;
      }
      if (this.cancelActiveSubscription === cancel) {
        this.cancelActiveSubscription = null;
      }
    };
    this.cancelActiveSubscription = cancel;

    // Start async subscription setup
    this.getSettingsDocRef()
      .then((docRef) => {
        if (cancelled || !docRef) {
          return; // Torn down, or no user: no subscription
        }

        active = onSnapshot(
          docRef,
          (snapshot) => {
            if (cancelled) return;
            if (snapshot.exists()) {
              const data = snapshot.data();
              // Remove Firestore metadata fields

              const {
                updatedAt: _updatedAt,
                createdAt: _createdAt,
                clearedAt: _clearedAt,
                ...settings
              } = data;
              // An existing document with no settings is still authoritative:
              // subscribers must clear stale optional slices such as imageExport.
              callback(normalizeLegacyAppSettings(settings));
            }
          },
          (error) => {
            // Expected on sign-out - user settings are no longer readable.
            if (isPermissionDeniedError(error)) return;
            console.error(
              "❌ [FirebaseSettingsPersister] Subscription error:",
              error
            );
            toast.error("Lost connection to settings. Please refresh.");
          }
        );

        // Cancelled while onSnapshot was being wired up.
        if (cancelled) {
          active();
          active = null;
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(
          "❌ [FirebaseSettingsPersister] Failed to initialize settings subscription:",
          error
        );
        toast.error("Failed to connect to settings.");
      });

    return cancel;
  }
}
