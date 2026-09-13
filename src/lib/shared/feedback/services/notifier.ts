/**
 * Notifier
 *
 * Manages tester notifications for feedback updates.
 */

import type { Timestamp } from "firebase/firestore";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { firestoreList, firestoreDelete } from "$lib/shared/firestore";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { isPermissionDeniedError } from "$lib/shared/auth/utils/is-permission-denied-error";
import type { UserNotification } from "$lib/shared/feedback/domain/models/notification-models";
import { UserNotificationSchema } from "$lib/shared/feedback/domain/models/feedback-schemas";

const USERS_COLLECTION = "users";
const NOTIFICATIONS_SUBCOLLECTION = "notifications";

/**
 * Convert a Firestore notification document into the discriminated shape the
 * inbox consumes. The live subscription and one-shot reads must preserve the
 * same deep-link fields or a card can look clickable while having no target.
 */
export function mapNotificationDocument(
  id: string,
  data: Record<string, unknown>
): UserNotification {
  const baseNotification = {
    id,
    userId: data["userId"] as string,
    type: data["type"] as UserNotification["type"],
    message: data["message"] as string,
    createdAt: (data["createdAt"] as Timestamp)?.toDate() || new Date(),
    read: data["read"] as boolean,
    readAt: (data["readAt"] as Timestamp)?.toDate(),
    fromUserId: data["fromUserId"] as string | undefined,
    fromUserName: data["fromUserName"] as string | undefined,
  };

  const type = data["type"] as string;

  if (type.startsWith("feedback-")) {
    return {
      ...baseNotification,
      type: type as UserNotification["type"],
      feedbackId: data["feedbackId"] as string,
      feedbackTitle: data["feedbackTitle"] as string,
      fromUserId: data["fromUserId"] as string,
      fromUserName: data["fromUserName"] as string,
    } as UserNotification;
  }
  if (type.startsWith("sequence-")) {
    return {
      ...baseNotification,
      type: type as UserNotification["type"],
      sequenceId: data["sequenceId"] as string,
      sequenceTitle: data["sequenceTitle"] as string,
      fromUserId: data["fromUserId"] as string,
      fromUserName: data["fromUserName"] as string,
      videoUrl: data["videoUrl"] as string | undefined,
      commentText: data["commentText"] as string | undefined,
    } as UserNotification;
  }
  if (type === "user-followed" || type === "achievement-unlocked") {
    return {
      ...baseNotification,
      type: type as UserNotification["type"],
      achievementId: data["achievementId"] as string | undefined,
      achievementName: data["achievementName"] as string | undefined,
    } as UserNotification;
  }
  if (type === "system-announcement") {
    return {
      ...baseNotification,
      type: type as UserNotification["type"],
      title: data["title"] as string,
      actionUrl: data["actionUrl"] as string | undefined,
    } as UserNotification;
  }
  if (type === "admin-new-user-signup") {
    return {
      ...baseNotification,
      type: type as UserNotification["type"],
      newUserId: data["newUserId"] as string,
      postHogSessionId: data["postHogSessionId"] as string | undefined,
      newUserEmail: data["newUserEmail"] as string | null,
      newUserDisplayName: data["newUserDisplayName"] as string,
    } as UserNotification;
  }
  if (
    type === "admin-user-returned" ||
    type === "admin-qr-scan" ||
    type === "admin-content-created"
  ) {
    return {
      ...baseNotification,
      type,
      returnedUserId: data["returnedUserId"] as string | undefined,
      postHogSessionId: data["postHogSessionId"] as string | undefined,
      shortCode: data["shortCode"] as string | undefined,
      scanCity: data["scanCity"] as string | null | undefined,
      scanCountry: data["scanCountry"] as string | null | undefined,
      scanLat: data["scanLat"] as number | null | undefined,
      scanLng: data["scanLng"] as number | null | undefined,
      scanCount: data["scanCount"] as number | undefined,
      contentType: data["contentType"] as "sequence" | "collection" | undefined,
      sequenceId: data["sequenceId"] as string | undefined,
      collectionId: data["collectionId"] as string | undefined,
      word: data["word"] as string | undefined,
      collectionName: data["collectionName"] as string | undefined,
    };
  }
  if (type === "admin-parity-audit") {
    return {
      ...baseNotification,
      type: "admin-parity-audit",
      auditStatus: data["auditStatus"] as "violations" | "failed",
      actionUrl: data["actionUrl"] as string,
      reportFile: data["reportFile"] as string | undefined,
      reportGeneratedAt: data["reportGeneratedAt"] as string | undefined,
      auditReconcileCount: (data["auditReconcileCount"] as number) ?? 0,
      auditShortcodeCount: (data["auditShortcodeCount"] as number) ?? 0,
      auditViolations: Array.isArray(data["auditViolations"])
        ? data["auditViolations"]
        : [],
      auditError: data["auditError"] as string | undefined,
    } as UserNotification;
  }

  return baseNotification as UserNotification;
}

export class Notifier {
  /**
   * Disposers for every live subscription. This used to be a single field
   * holding "the current listener", which made the lifetime of a subscription
   * depend on what else happened to be running: a disposer returned to one
   * caller tore down whichever listener was current, and a disposer that ran
   * before its own `onSnapshot` existed (registration is async) tore down
   * nothing at all and left the listener attached forever — still pushing the
   * previous account's notifications into the inbox after sign-out.
   */
  private subscriptions = new Set<() => void>();

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;
      const items = await firestoreList(
        subcollectionPath,
        UserNotificationSchema,
        { where: [{ field: "read", op: "==", value: false }] }
      );
      return items.length;
    } catch (error) {
      console.error("[Notifier] Failed to get unread count:", error);
      return 0;
    }
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    userId: string,
    maxCount: number = 20
  ): Promise<UserNotification[]> {
    try {
      const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;
      const items = await firestoreList(
        subcollectionPath,
        UserNotificationSchema,
        {
          orderBy: [{ field: "createdAt", direction: "desc" }],
          limit: maxCount,
        }
      );
      // firestoreList returns the flat schema shape (all per-variant fields
      // optional); the validated `type` literal is the discriminant, so a single
      // assertion to the union is sound here — no `as unknown` double-cast.
      return items as UserNotification[];
    } catch (error) {
      console.error("[Notifier] Failed to get notifications:", error);
      toast.error("Failed to load notifications.");
      return [];
    }
  }

  /**
   * Map Firestore document to notification object
   */
  private mapDocToNotification(
    id: string,
    data: Record<string, unknown>
  ): UserNotification {
    return mapNotificationDocument(id, data);
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const notificationRef = doc(
        firestore,
        USERS_COLLECTION,
        userId,
        NOTIFICATIONS_SUBCOLLECTION,
        notificationId
      );

      await updateDoc(notificationRef, {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("[Notifier] Failed to mark notification as read:", error);
      // Silent failure - non-critical for UX
    }
  }

  /**
   * Mark a notification as unread
   */
  async markAsUnread(userId: string, notificationId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const notificationRef = doc(
        firestore,
        USERS_COLLECTION,
        userId,
        NOTIFICATIONS_SUBCOLLECTION,
        notificationId
      );

      await updateDoc(notificationRef, {
        read: false,
        readAt: null,
      });
    } catch (error) {
      console.error("[Notifier] Failed to mark notification as unread:", error);
      // Silent failure - non-critical for UX
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const notificationsRef = collection(
        firestore,
        USERS_COLLECTION,
        userId,
        NOTIFICATIONS_SUBCOLLECTION
      );

      const q = query(notificationsRef, where("read", "==", false));
      const snapshot = await getDocs(q);

      const updates = snapshot.docs.map((docSnap) =>
        updateDoc(docSnap.ref, { read: true, readAt: serverTimestamp() })
      );

      await Promise.all(updates);
    } catch (error) {
      console.error("[Notifier] Failed to mark all as read:", error);
      toast.error("Failed to mark all as read.");
    }
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(
    userId: string,
    notificationId: string
  ): Promise<void> {
    try {
      const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;
      await firestoreDelete(subcollectionPath, notificationId);
    } catch (error) {
      console.error("[Notifier] Failed to delete notification:", error);
      toast.error("Failed to delete notification.");
    }
  }

  /**
   * Delete all read notifications
   */
  async deleteAllReadNotifications(userId: string): Promise<void> {
    try {
      const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;
      const items = await firestoreList(
        subcollectionPath,
        UserNotificationSchema,
        { where: [{ field: "read", op: "==", value: true }] }
      );

      const deletes = items.map((item) =>
        firestoreDelete(subcollectionPath, item.id)
      );
      await Promise.all(deletes);
    } catch (error) {
      console.error("[Notifier] Failed to delete read notifications:", error);
      toast.error("Failed to clear read notifications.");
    }
  }

  /**
   * Delete all notifications
   */
  async deleteAllNotifications(userId: string): Promise<void> {
    try {
      const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;
      const items = await firestoreList(
        subcollectionPath,
        UserNotificationSchema
      );

      const deletes = items.map((item) =>
        firestoreDelete(subcollectionPath, item.id)
      );
      await Promise.all(deletes);
    } catch (error) {
      console.error("[Notifier] Failed to delete all notifications:", error);
      toast.error("Failed to clear all notifications.");
    }
  }

  /**
   * Subscribe to real-time notification updates
   * @param userId - User ID to subscribe to
   * @param callback - Callback function to receive notifications
   * @param maxCount - Maximum number of notifications to retrieve (default: 20, set to 0 for all)
   */
  subscribeToNotifications(
    userId: string,
    callback: (notifications: UserNotification[]) => void,
    maxCount: number = 20
  ): () => void {
    // Each subscription owns its own lifetime: `dispose` ends this one and
    // nothing else, and it works whether or not the async registration below
    // has produced a listener yet.
    let disposed = false;
    let detach: (() => void) | null = null;

    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      detach?.();
      detach = null;
      this.subscriptions.delete(dispose);
    };

    this.subscriptions.add(dispose);

    // Initialize subscription asynchronously
    void (async () => {
      try {
        const firestore = await getFirestoreInstance();
        // The caller unmounted while Firestore was resolving. Registering now
        // would attach a listener with no owner and no way to reach it.
        if (disposed) return;

        const notificationsRef = collection(
          firestore,
          USERS_COLLECTION,
          userId,
          NOTIFICATIONS_SUBCOLLECTION
        );

        // Build query with or without limit based on maxCount
        const q =
          maxCount > 0
            ? query(
                notificationsRef,
                orderBy("createdAt", "desc"),
                limit(maxCount)
              )
            : query(notificationsRef, orderBy("createdAt", "desc"));

        detach = onSnapshot(
          q,
          (snapshot) => {
            // A snapshot already queued when the listener was detached must
            // not reach a consumer that is gone.
            if (disposed) return;
            const notifications: UserNotification[] = snapshot.docs.map(
              (docSnap) => this.mapDocToNotification(docSnap.id, docSnap.data())
            );
            callback(notifications);
          },
          (error) => {
            if (disposed) return;
            // Expected on sign-out. Skip the toast; the listener is about to
            // be cleaned up by the auth state handler.
            if (isPermissionDeniedError(error)) return;
            console.error(
              "[Notifier] Notifications subscription error:",
              error
            );
            toast.error("Lost connection to notifications. Please refresh.");
          }
        );
      } catch (error) {
        if (disposed) return;
        console.error(
          "[Notifier] Failed to initialize notifications subscription:",
          error
        );
        toast.error("Failed to connect to notifications.");
      }
    })();

    return dispose;
  }

  /**
   * Clean up subscriptions
   */
  cleanup(): void {
    for (const dispose of [...this.subscriptions]) dispose();
    this.subscriptions.clear();
  }
}

// Export singleton instance
export const notificationService = new Notifier();
