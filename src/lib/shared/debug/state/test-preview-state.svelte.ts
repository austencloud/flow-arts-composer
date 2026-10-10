/**
 * Test Preview State
 * Read-only preview of another user's notifications (dev/debug only).
 * Uses direct Firestore queries; never marks notifications as read.
 */
import { browser } from "$app/env";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { PUBLIC_PROFILE_VERSION } from "#lib/shared/community/domain/models/public-profile-contract.js";

type PreviewNotification = {
  id: string;
  type: string;
  title?: string;
  feedbackTitle?: string;
  message?: string;
  actionUrl?: string;
  feedbackId?: string;
  read?: boolean;
  createdAt?: string;
};

type UserSuggestion = {
  id: string;
  displayName?: string;
  email?: string;
};

export const testPreviewState = $state({
  isActive: false,
  isLoading: false,
  error: "" as string | null,
  userId: "" as string,
  userLabel: "" as string,
  notifications: [] as PreviewNotification[],
  searchLoading: false,
  searchError: "" as string | null,
  suggestions: [] as UserSuggestion[],
});

export async function loadPreviewNotifications(
  userId: string,
  userLabel?: string
) {
  if (!browser) return;
  testPreviewState.isLoading = true;
  testPreviewState.error = null;

  try {
    const firestore = await getFirestoreInstance();
    const q = query(
      collection(firestore, `users/${userId}/notifications`),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);

    const notifications: PreviewNotification[] = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type || "general",
        title: data.title || undefined,
        feedbackTitle: data.feedbackTitle || undefined,
        message: data.message || undefined,
        actionUrl: data.actionUrl || undefined,
        feedbackId: data.feedbackId || undefined,
        read: data.read || false,
        createdAt:
          data.createdAt?.toDate?.()?.toISOString?.() ||
          data.createdAt?.toISOString?.() ||
          undefined,
      };
    });

    testPreviewState.notifications = notifications;
    testPreviewState.userId = userId;
    testPreviewState.userLabel = userLabel || userId;
    testPreviewState.isActive = true;
  } catch (err: unknown) {
    testPreviewState.error =
      err instanceof Error
        ? err.message
        : "Failed to load preview notifications";
    testPreviewState.isActive = false;
    testPreviewState.notifications = [];
  } finally {
    testPreviewState.isLoading = false;
  }
}

export function clearPreview() {
  testPreviewState.isActive = false;
  testPreviewState.notifications = [];
  testPreviewState.userId = "";
  testPreviewState.userLabel = "";
  testPreviewState.error = null;
}

export async function searchPreviewUsers(searchQuery: string) {
  if (!browser || !searchQuery.trim()) {
    testPreviewState.suggestions = [];
    return;
  }

  testPreviewState.searchLoading = true;
  testPreviewState.searchError = null;

  try {
    const firestore = await getFirestoreInstance();
    const q = query(
      collection(firestore, "users"),
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      limit(200)
    );
    const snap = await getDocs(q);

    const queryLower = searchQuery.trim().toLowerCase();
    const matches: UserSuggestion[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const displayName = data.displayName || data.name || "";
      const email = data.email || "";

      const haystack = `${displayName} ${email}`.toLowerCase();
      if (haystack.includes(queryLower)) {
        matches.push({
          id: doc.id,
          displayName: displayName || undefined,
          email: email || undefined,
        });
      }

      if (matches.length >= 8) break;
    }

    testPreviewState.suggestions = matches;
  } catch (err: unknown) {
    testPreviewState.searchError =
      err instanceof Error ? err.message : "Failed to search users (preview)";
    testPreviewState.suggestions = [];
  } finally {
    testPreviewState.searchLoading = false;
  }
}
