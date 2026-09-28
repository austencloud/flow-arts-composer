/**
 * Firestore reads behind the admin user preview.
 *
 * Public pages reach the preview state through app-state, which only asks
 * whether a preview is active. These reads therefore load Firebase with
 * import() when an admin opens a preview. A static Firebase import here can
 * put Firebase Auth and Firestore back on those pages' first download:
 * Rollup's small-chunk merge (vite.config.ts) folds a module this size into
 * the startup chunk that imports it, even through an import(), and it ignores
 * the vendor-firebase chunk when it checks what a merge would load.
 */
import type { Timestamp } from "firebase/firestore";
import type { AppSettings } from "$lib/shared/settings/domain/app-settings";
import type { NotificationPreferences } from "$lib/shared/notifications/domain/models/notification-models";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "$lib/shared/notifications/domain/models/notification-models";
import type {
  PreviewAuthData,
  PreviewCollection,
  PreviewNotification,
  PreviewSequence,
  PreviewUserProfile,
} from "../state/user-preview-state.svelte";

function formatTimestamp(
  ts: Timestamp | Date | string | null | undefined
): string | null {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === "object" && "toDate" in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return null;
}

async function loadFirestoreInstance() {
  const { getFirestoreInstance } = await import("$lib/shared/auth/firebase");
  return getFirestoreInstance();
}

export async function fetchProfile(
  userId: string
): Promise<PreviewUserProfile | null> {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const firestore = await loadFirestoreInstance();
    const userDoc = await getDoc(doc(firestore, "users", userId));

    if (!userDoc.exists()) {
      // Return minimal profile with just the UID
      return {
        uid: userId,
        email: null,
        displayName: null,
        photoURL: null,
        role: "user",
      };
    }

    const data = userDoc.data();
    return {
      uid: userId,
      email: data.email || null,
      displayName: data.displayName || null,
      photoURL: data.photoURL || data.avatar || null,
      username: data.username || null,
      role: data.role || (data.isAdmin ? "admin" : "user"),
      createdAt: formatTimestamp(data.createdAt) || undefined,
      lastActivityDate: formatTimestamp(data.lastActivityDate) || undefined,
    };
  } catch (err) {
    console.error("[UserPreview] Failed to fetch profile:", err);
    return null;
  }
}

export async function fetchSequences(
  userId: string
): Promise<PreviewSequence[]> {
  try {
    const { collection, query, where, orderBy, limit, getDocs } =
      await import("firebase/firestore");
    const firestore = await loadFirestoreInstance();
    const q = query(
      collection(firestore, "sequences"),
      where("createdBy", "==", userId),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || "Untitled",
        word: data.word || undefined,
        thumbnailUrl: data.thumbnailUrl || undefined,
        createdAt: formatTimestamp(data.createdAt) || undefined,
        isPublic: data.isPublic || false,
        favoriteCount: data.favoriteCount || 0,
      };
    });
  } catch (err) {
    console.error("[UserPreview] Failed to fetch sequences:", err);
    return [];
  }
}

export async function fetchCollections(
  userId: string
): Promise<PreviewCollection[]> {
  try {
    const { collection, query, orderBy, limit, getDocs } =
      await import("firebase/firestore");
    const firestore = await loadFirestoreInstance();
    const q = query(
      collection(firestore, `users/${userId}/collections`),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || "Untitled",
        description: data.description || undefined,
        sequenceCount: data.sequenceCount || 0,
        isSystem: data.isSystem || false,
        createdAt: formatTimestamp(data.createdAt) || undefined,
      };
    });
  } catch (err) {
    console.error("[UserPreview] Failed to fetch collections:", err);
    return [];
  }
}

export async function fetchNotifications(
  userId: string
): Promise<PreviewNotification[]> {
  try {
    const { collection, query, orderBy, limit, getDocs } =
      await import("firebase/firestore");
    const firestore = await loadFirestoreInstance();
    const q = query(
      collection(firestore, `users/${userId}/notifications`),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        type: data.type || "general",
        title: data.title || undefined,
        message: data.message || undefined,
        read: data.read || false,
        createdAt: formatTimestamp(data.createdAt) || undefined,
      };
    });
  } catch (err) {
    console.error("[UserPreview] Failed to fetch notifications:", err);
    return [];
  }
}

export async function fetchSettings(
  userId: string
): Promise<AppSettings | null> {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const firestore = await loadFirestoreInstance();
    const settingsDoc = await getDoc(
      doc(firestore, `users/${userId}/settings/preferences`)
    );

    if (!settingsDoc.exists()) {
      return null;
    }

    const data = settingsDoc.data();
    // Remove Firestore metadata fields
    const { updatedAt: _u, createdAt: _c, clearedAt: _cl, ...settings } = data;
    return settings as AppSettings;
  } catch (err) {
    console.error("[UserPreview] Failed to fetch settings:", err);
    return null;
  }
}

export async function fetchNotificationPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const firestore = await loadFirestoreInstance();
    const prefsDoc = await getDoc(
      doc(firestore, `users/${userId}/settings/notificationPreferences`)
    );

    if (!prefsDoc.exists()) {
      // Return defaults if no preferences doc exists
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }

    const data = prefsDoc.data();
    // Merge with defaults to ensure all fields are present
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...data,
    } as NotificationPreferences;
  } catch (err) {
    console.error(
      "[UserPreview] Failed to fetch notification preferences:",
      err
    );
    return null;
  }
}

/**
 * Fetch user's Firebase Auth data via admin endpoint.
 * Requires the caller to be an admin.
 */
export async function fetchAuthData(
  userId: string
): Promise<PreviewAuthData | null> {
  try {
    // Get the current user's ID token for auth
    // Use getAuthInstance() to ensure Firebase is properly initialized
    const { getAuthInstance } = await import("$lib/shared/auth/firebase");
    const auth = await getAuthInstance();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn("[UserPreview] Cannot fetch auth data - not signed in");
      return null;
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/admin/user-auth/${userId}`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("[UserPreview] Failed to fetch auth data:", error);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("[UserPreview] Failed to fetch auth data:", err);
    return null;
  }
}
