/**
 * Push Dispatcher
 *
 * Shared utility for sending FCM push notifications to user devices.
 * Handles token lookup, multicast delivery, stale token cleanup,
 * and notification preference checking.
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import type { PushPayload } from "./types";
import { getAndroidChannelId } from "./androidChannels";

const db = admin.firestore();

/**
 * Token docs are keyed by the FIRST 32 HEX CHARS of the SHA-256 hash of the
 * token (see the client's fcm-token-manager.hashToken — it slices to 32).
 * Cleanup must address docs by that exact id — deleting by raw token value
 * (or by the full 64-char hash) silently removes nothing, which left stale
 * tokens accumulating forever (15 zombies observed on 2026-07-09).
 */
function tokenDocId(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** FCM error codes that indicate a token is permanently invalid */
const STALE_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

/**
 * A token whose device hasn't opened the app in a very long time is almost
 * always dead. The client stamps `lastRefreshed` on every registration (each
 * app open), so a frozen `lastRefreshed` marks an abandoned device. 270 days
 * follows Google's own FCM hygiene guidance (refresh monthly; treat long-idle
 * tokens as stale). Pruning by age reclaims two classes that error-based
 * cleanup misses: legacy tokens that predate per-device dedup, and dead
 * subscriptions FCM keeps "accepting" (returns success) yet never delivers to.
 */
const STALE_TOKEN_MAX_AGE_MS = 270 * 24 * 60 * 60 * 1000;

type PushTransport = "web" | "android-native";

interface ActiveToken {
  token: string;
  transport: PushTransport;
}

/**
 * Maps notification types to their preference key in the user's
 * notification preferences document. Types not in this map are
 * either always-on (system-announcement) or handled elsewhere
 * (message-received is checked via messageReceived in onNewMessage).
 */
const PREF_KEY_MAP: Record<string, string> = {
  "feedback-resolved": "feedbackResolved",
  "feedback-in-progress": "feedbackInProgress",
  "feedback-needs-info": "feedbackNeedsInfo",
  "feedback-response": "feedbackResponse",
  "sequence-liked": "sequenceLiked",
  "user-followed": "userFollowed",
  "achievement-unlocked": "achievementUnlocked",
  "admin-new-user-signup": "adminNewUserSignup",
  "admin-user-returned": "adminUserReturned",
  "admin-qr-scan": "adminQrScan",
  "admin-content-created": "adminContentCreated",
  "admin-software-submission": "adminSoftwareSubmission",
  "admin-site-visit": "adminSiteVisit",
  "moderation-warning": "moderationWarning",
  "system-announcement": "systemAnnouncement",
};

/**
 * Send a push notification to all of a user's registered devices.
 *
 * Uses data-only messages so the service worker controls display.
 * Automatically removes tokens that FCM reports as invalid.
 *
 * @param userId - Target user's Firebase UID
 * @param payload - Notification content and metadata
 * @param unreadCount - Total unread count for badge display
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  unreadCount: number
): Promise<void> {
  const activeTokens = await getActiveTokens(userId);
  if (activeTokens.length === 0) {
    return;
  }

  const data = {
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    type: payload.type,
    unreadCount: String(unreadCount),
    ...(payload.conversationId
      ? { conversationId: payload.conversationId }
      : {}),
    ...(payload.notificationId
      ? { notificationId: payload.notificationId }
      : {}),
  };
  const webTokens = activeTokens
    .filter(({ transport }) => transport === "web")
    .map(({ token }) => token);
  const androidTokens = activeTokens
    .filter(({ transport }) => transport === "android-native")
    .map(({ token }) => token);

  const sends: Promise<admin.messaging.BatchResponse>[] = [];
  if (webTokens.length > 0) {
    sends.push(
      admin.messaging().sendEachForMulticast({
        tokens: webTokens,
        data,
        webpush: {
          headers: { Urgency: "high" },
          fcmOptions: { link: payload.url },
        },
      })
    );
  }
  if (androidTokens.length > 0) {
    sends.push(
      admin.messaging().sendEachForMulticast({
        tokens: androidTokens,
        data,
        notification: { title: payload.title, body: payload.body },
        android: {
          priority: "high",
          notification: {
            channelId: getAndroidChannelId(payload.type),
            tag: payload.tag,
            defaultSound: true,
          },
        },
      })
    );
  }

  const responses = await Promise.all(sends);
  let responseIndex = 0;
  for (const tokens of [webTokens, androidTokens]) {
    if (tokens.length === 0) continue;
    const response = responses[responseIndex++];
    if (response.failureCount > 0) {
      await cleanupStaleTokens(userId, tokens, response.responses);
    }
  }
}

/**
 * Send a data-only (non-displaying) message to all of a user's devices.
 * Used for state sync (badge counts, dismissing shade notifications after
 * the inbox is cleared elsewhere). The service worker recognizes
 * `data.action` payloads and never calls showNotification for them.
 */
export async function sendDataToUser(
  userId: string,
  data: Record<string, string>
): Promise<void> {
  const activeTokens = await getActiveTokens(userId);
  const tokens = activeTokens.map(({ token }) => token);
  if (tokens.length === 0) return;

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data,
    webpush: { headers: { Urgency: "high" } },
  });

  if (response.failureCount > 0) {
    await cleanupStaleTokens(userId, tokens, response.responses);
  }
}

/**
 * Check whether push notifications should be sent for a given
 * notification type, based on the user's stored preferences.
 *
 * System announcements and moderation warnings always return true.
 * Messages are handled separately (via messageReceived in onNewMessage).
 *
 * There is no account-wide push switch: each device turns push on or off by
 * adding or removing its own token, so muting one device never silences the
 * others. The old `pushEnabled` field is ignored.
 *
 * @param userId - User to check preferences for
 * @param notificationType - The notification type string
 * @returns true if push should be sent, false to suppress
 */
export async function shouldPushForType(
  userId: string,
  notificationType: string
): Promise<boolean> {
  // System announcements and moderation warnings always push
  if (
    notificationType === "system-announcement" ||
    notificationType === "admin-parity-audit" ||
    notificationType === "moderation-warning"
  ) {
    return true;
  }

  const prefKey = PREF_KEY_MAP[notificationType];
  if (!prefKey) {
    // Unknown type - default to sending
    console.warn(
      `No preference key mapped for notification type: ${notificationType}`
    );
    return true;
  }

  const userDoc = await db
    .collection("users")
    .doc(userId)
    .collection("settings")
    .doc("notificationPreferences")
    .get();

  if (!userDoc.exists) {
    return true;
  }

  const prefs = userDoc.data()?.notificationPreferences as
    | Record<string, boolean>
    | undefined;

  if (!prefs) {
    // No preferences field = all defaults enabled
    return true;
  }

  // Check the specific preference (default to true if not set)
  const value = prefs[prefKey];
  return value !== false;
}

/**
 * Get the total unread count across notifications and messages.
 *
 * Used for badge count in push payloads so the client can update
 * the app badge without a separate fetch.
 *
 * @param userId - User to count unreads for
 * @returns Total unread count (notifications + messages)
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const [notificationCount, messageCount] = await Promise.all([
    getUnreadNotificationCount(userId),
    getUnreadMessageCount(userId),
  ]);

  return notificationCount + messageCount;
}

// --- Internal helpers ---

/**
 * Fetch all active FCM tokens for a user.
 * Tokens are stored as documents in users/{userId}/fcmTokens.
 *
 * Opportunistically prunes malformed docs (no token) and abandoned-device
 * tokens (lastRefreshed older than STALE_TOKEN_MAX_AGE_MS) so every send
 * targets only live devices and the collection can't accumulate zombies that
 * FCM never flags as invalid. Cleanup is awaited only when something is
 * actually stale, so the common path adds no latency.
 */
async function getActiveTokens(userId: string): Promise<ActiveToken[]> {
  const tokensSnapshot = await db
    .collection("users")
    .doc(userId)
    .collection("fcmTokens")
    .get();

  const now = Date.now();
  const live: ActiveToken[] = [];
  const staleRefs: admin.firestore.DocumentReference[] = [];

  tokensSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const token = data.token as string | undefined;
    if (!token) {
      staleRefs.push(doc.ref);
      return;
    }
    const refreshedAt = (
      data.lastRefreshed as admin.firestore.Timestamp | undefined
    )?.toMillis?.();
    if (
      refreshedAt !== undefined &&
      now - refreshedAt > STALE_TOKEN_MAX_AGE_MS
    ) {
      staleRefs.push(doc.ref);
      return;
    }
    const transport =
      data.transport === "android-native" ? "android-native" : "web";
    live.push({ token, transport });
  });

  if (staleRefs.length > 0) {
    await Promise.all(staleRefs.map((ref) => ref.delete())).catch((error) => {
      console.warn(`Age-based token prune failed for ${userId}:`, error);
    });
    console.log(
      `Pruned ${staleRefs.length} abandoned FCM token(s) for user ${userId}`
    );
  }

  return live;
}

/**
 * Remove tokens that FCM reported as invalid.
 * This keeps the token collection clean and prevents wasted
 * send attempts on subsequent pushes.
 */
async function cleanupStaleTokens(
  userId: string,
  tokens: string[],
  responses: admin.messaging.SendResponse[]
): Promise<void> {
  const batch = db.batch();
  let staleCount = 0;

  responses.forEach((resp, idx) => {
    if (resp.error && STALE_TOKEN_ERRORS.has(resp.error.code)) {
      const tokenRef = db
        .collection("users")
        .doc(userId)
        .collection("fcmTokens")
        .doc(tokenDocId(tokens[idx]));
      batch.delete(tokenRef);
      staleCount++;
    }
  });

  if (staleCount > 0) {
    await batch.commit();
    console.log(
      `Cleaned up ${staleCount} stale FCM token(s) for user ${userId}`
    );
  }
}

/**
 * Count unread notifications for a user using Firestore aggregation.
 */
async function getUnreadNotificationCount(userId: string): Promise<number> {
  const snapshot = await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .where("read", "==", false)
    .count()
    .get();

  return snapshot.data().count;
}

/**
 * Count unread messages across all conversations the user participates in.
 *
 * Queries conversations where the user is a participant, then sums
 * their per-user unread count from each conversation document.
 */
async function getUnreadMessageCount(userId: string): Promise<number> {
  const conversationsSnapshot = await db
    .collection("conversations")
    .where("participants", "array-contains", userId)
    .get();

  let total = 0;
  for (const doc of conversationsSnapshot.docs) {
    const data = doc.data();
    const unreadMap = data.unreadCount as Record<string, number> | undefined;
    if (unreadMap && typeof unreadMap[userId] === "number") {
      total += unreadMap[userId];
    }
  }

  return total;
}
