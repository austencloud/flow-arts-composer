/**
 * Feedback Subscriber
 *
 * Handles real-time feedback subscriptions via Firestore listeners.
 * Ensures fresh data by first fetching from server, then setting up listeners.
 */

import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  getDocsFromServer,
  type Unsubscribe,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";

import type { FeedbackItem } from "#lib/shared/feedback/domain/models/feedback-models.js";
import * as feedbackDocumentMapper from "#lib/shared/feedback/services/feedback-document-mapper.js";

const COLLECTION_NAME = "feedback";

function mapSnapshotToItems(
  snapshot: QuerySnapshot<DocumentData, DocumentData>
): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  snapshot.docs.forEach((docSnap) => {
    try {
      const item = feedbackDocumentMapper.mapDocToFeedbackItem(
        docSnap.id,
        docSnap.data()
      );
      items.push(item);
    } catch (err) {
      console.error(`Failed to map feedback item ${docSnap.id}:`, err);
    }
  });
  return items;
}

export function subscribeToFeedback(
  onUpdate: (items: FeedbackItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribed = false;
  let firestoreUnsubscribe: Unsubscribe | null = null;

  (async () => {
    try {
      const firestore = await getFirestoreInstance();

      const q = query(
        collection(firestore, COLLECTION_NAME),
        where("status", "in", [
          "new",
          "in-progress",
          "in-review",
          "completed",
        ]),
        orderBy("createdAt", "desc"),
        limit(200)
      );

      getDocsFromServer(q)
        .then((snapshot) => {
          if (unsubscribed) return;
          const items = mapSnapshotToItems(snapshot);
          onUpdate(items);
        })
        .catch((error) => {
          console.error("[feedback-subscriber] Initial fetch error:", error);
        });

      firestoreUnsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: false },
        (snapshot) => {
          if (unsubscribed) return;
          const items = mapSnapshotToItems(snapshot);
          onUpdate(items);
        },
        (error) => {
          if (isPermissionDeniedError(error)) {
            onError?.(error);
            return;
          }
          console.error("[feedback-subscriber] Subscription error:", error);
          toast.error("Lost connection to feedback. Please refresh.");
          onError?.(error);
        }
      );
    } catch (error) {
      console.error(
        "[feedback-subscriber] Failed to initialize subscription:",
        error
      );
      toast.error("Failed to connect to feedback.");
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => {
    unsubscribed = true;
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe();
    }
  };
}

export function subscribeToUserFeedback(
  userId: string,
  onUpdate: (items: FeedbackItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribed = false;
  let firestoreUnsubscribe: Unsubscribe | null = null;

  (async () => {
    try {
      const firestore = await getFirestoreInstance();

      const q = query(
        collection(firestore, COLLECTION_NAME),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );

      getDocsFromServer(q)
        .then((snapshot) => {
          if (unsubscribed) return;
          const items = mapSnapshotToItems(snapshot);
          onUpdate(items);
        })
        .catch((error) => {
          console.error(
            "[feedback-subscriber] Initial user fetch error:",
            error
          );
        });

      firestoreUnsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: false },
        (snapshot) => {
          if (unsubscribed) return;
          const items = mapSnapshotToItems(snapshot);
          onUpdate(items);
        },
        (error) => {
          if (isPermissionDeniedError(error)) {
            onError?.(error);
            return;
          }
          console.error(
            "[feedback-subscriber] User subscription error:",
            error
          );
          toast.error("Lost connection to your feedback. Please refresh.");
          onError?.(error);
        }
      );
    } catch (error) {
      console.error(
        "[feedback-subscriber] Failed to initialize user subscription:",
        error
      );
      toast.error("Failed to connect to your feedback.");
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => {
    unsubscribed = true;
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe();
    }
  };
}
