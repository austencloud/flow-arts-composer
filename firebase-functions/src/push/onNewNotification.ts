/**
 * onNewNotification Cloud Function
 *
 * Firestore trigger that fires when a new notification is created
 * in a user's notifications subcollection. Sends a push notification
 * to the user's registered devices.
 *
 * Skips "message-received" type since that's handled by onNewMessage.
 *
 * Trigger path: users/{userId}/notifications/{notificationId}
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  sendPushToUser,
  shouldPushForType,
  getUnreadCount,
} from "./pushDispatcher";
import type { PushPayload } from "./types";
import { safeInternalActionUrl } from "./internalActionUrl";

export const onNewNotification = onDocumentCreated(
  "users/{userId}/notifications/{notificationId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.warn("onNewNotification: No data in event");
      return;
    }

    const notificationData = snapshot.data();
    const { userId, notificationId } = event.params;

    const type: string = notificationData.type;
    const message: string = notificationData.message || "";
    const fromUserName: string | undefined = notificationData.fromUserName;
    const actionUrl = safeInternalActionUrl(notificationData.actionUrl);

    // Skip message-received notifications - handled by onNewMessage
    if (type === "message-received") {
      return;
    }

    // Check user's preference for this notification type
    const shouldSend = await shouldPushForType(userId, type);
    if (!shouldSend) {
      return;
    }

    const unreadCount = await getUnreadCount(userId);

    // Build the push title. Pulse/admin types get a clean label (the scanner's
    // name and full detail already live in the body) instead of the ugly
    // slug-cased fallback ("Admin Qr Scan"). Social types keep the sender name.
    const title =
      PULSE_TITLES[type] || fromUserName || formatNotificationType(type);

    const payload: PushPayload = {
      title,
      body: message,
      url: actionUrl ?? "/create?sheet=inbox&inboxTab=notifications",
      tag: `notification-${type}`,
      type,
      notificationId,
    };

    try {
      await sendPushToUser(userId, payload, unreadCount);
    } catch (error) {
      console.error(
        `onNewNotification: Failed to send push for ${type} to user ${userId}`,
        error
      );
    }
  }
);

/**
 * Clean push titles for the admin Pulse family — the body already carries the
 * who/what/where, so the title stays a short, human label.
 */
const PULSE_TITLES: Record<string, string> = {
  "admin-qr-scan": "QR Scan",
  "admin-user-returned": "User Returned",
  "admin-new-user-signup": "New Signup",
  "admin-content-created": "New Content",
  "admin-parity-audit": "Parity Audit",
  "admin-software-submission": "Software submission",
  "admin-site-visit": "Site Visitor",
};

/**
 * Convert a notification type slug to a readable title.
 * Used as fallback when fromUserName is not available.
 *
 * Examples:
 *   "feedback-resolved" -> "Feedback Resolved"
 *   "achievement-unlocked" -> "Achievement Unlocked"
 */
function formatNotificationType(type: string): string {
  return type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
