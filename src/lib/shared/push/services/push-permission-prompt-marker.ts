import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "#lib/shared/foundation/services/storage-manager.js";

const LOCAL_MARKER_PREFIX = "tka-push-permission-prompt-seen:";
const LEGACY_DISMISSAL_KEY = "tka-push-prompt-dismissed";
const CLOUD_DOCUMENT = "settings/pushPermissionPrompt";

type LocalMarker = "pending" | "cloud";

function localMarkerKey(userId: string): string {
  return `${LOCAL_MARKER_PREFIX}${userId}`;
}

function getLocalMarker(userId: string): LocalMarker | null {
  const marker = safeLocalStorageGet<unknown>(localMarkerKey(userId));
  return marker === "pending" || marker === "cloud" ? marker : null;
}

function setLocalMarker(userId: string, marker: LocalMarker): void {
  safeLocalStorageSet(localMarkerKey(userId), marker);
}

function hasLegacyDismissal(): boolean {
  try {
    return localStorage.getItem(LEGACY_DISMISSAL_KEY) !== null;
  } catch {
    return false;
  }
}

async function persistSeenMarker(userId: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  await setDoc(
    doc(firestore, `users/${userId}/${CLOUD_DOCUMENT}`),
    { seen: true },
    { merge: true }
  );
  setLocalMarker(userId, "cloud");
}

/**
 * Claims the one account-level opportunity to show the push permission prompt.
 *
 * A local marker prevents duplicate prompts across tabs immediately. Firestore
 * makes the decision durable across browsers and devices. A failed cloud read
 * suppresses the optional prompt; a failed write leaves a pending local marker
 * that retries next session without showing the prompt again.
 */
export async function claimPushPermissionPrompt(
  userId: string
): Promise<boolean> {
  const localMarker = getLocalMarker(userId);

  if (localMarker === "cloud") return false;

  if (localMarker === "pending" || hasLegacyDismissal()) {
    setLocalMarker(userId, "pending");
    try {
      await persistSeenMarker(userId);
    } catch (error) {
      console.warn(
        "[PushPermissionPromptMarker] Failed to sync an existing seen marker:",
        error
      );
    }
    return false;
  }

  try {
    const firestore = await getFirestoreInstance();
    const markerRef = doc(firestore, `users/${userId}/${CLOUD_DOCUMENT}`);
    const snapshot = await getDoc(markerRef);

    if (snapshot.exists() && snapshot.data().seen === true) {
      setLocalMarker(userId, "cloud");
      return false;
    }

    // Another tab may have claimed the prompt while the cloud read was in
    // flight. Re-check the shared local marker before taking the claim.
    if (getLocalMarker(userId)) return false;

    setLocalMarker(userId, "pending");
    await setDoc(markerRef, { seen: true }, { merge: true });
    setLocalMarker(userId, "cloud");
    return true;
  } catch (error) {
    console.warn(
      "[PushPermissionPromptMarker] Could not claim the prompt:",
      error
    );
    return false;
  }
}
