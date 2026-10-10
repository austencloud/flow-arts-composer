/**
 * notification-trigger-service
 *
 * Central service for creating notifications with user preference checking.
 * All notification creation should go through this module to respect user preferences.
 *
 * IMPLEMENTATION GUIDE FOR FUTURE FEATURES:
 *
 * When implementing new features that trigger notifications, follow this pattern:
 *
 * 1. FEEDBACK NOTIFICATIONS (feedback-response, feedback-status-changed, feedback-needs-info, feedback-resolved)
 *    - Already implemented in FeedbackService.ts
 *    - Triggered when admin interacts with user feedback
 *    - Example: createFeedbackNotification(userId, 'feedback-response', feedbackId, feedbackTitle, message, adminId, adminName)
 *
 * 2. SEQUENCE NOTIFICATIONS (sequence-saved, sequence-video-submitted, sequence-liked, sequence-commented)
 *    - TODO: Implement in SequenceService when save/like/comment features are added
 *    - sequence-saved: When user saves another user's sequence
 *    - sequence-video-submitted: When user submits video for another user's sequence
 *    - sequence-liked: When user likes another user's sequence
 *    - sequence-commented: When user comments on another user's sequence
 *    - Example: createSequenceNotification(sequenceOwnerId, 'sequence-liked', sequenceId, sequenceTitle, `${userName} liked your sequence`, userId, userName)
 *
 * 3. SOCIAL NOTIFICATIONS (user-followed, achievement-unlocked)
 *    - user-followed: TODO: Implement in UserService when follow feature is added
 *    - achievement-unlocked: TODO: Implement in GamificationService when achievement system triggers
 *    - Example: createSocialNotification(userId, 'achievement-unlocked', `You unlocked ${achievementName}!`, undefined, undefined, achievementId, achievementName)
 *
 * 4. SYSTEM NOTIFICATIONS (system-announcement)
 *    - TODO: Create admin panel for broadcasting announcements
 *    - Bypasses user preferences (always shown)
 *    - Use for critical app updates, maintenance notices, etc.
 *    - Example: createSystemNotification(userId, 'New Feature Released', 'Check out the new animation tools!', '/animate')
 *
 * IMPORTANT:
 * - Never create notifications directly in Firestore - always use this module
 * - The module automatically checks user preferences before creating notifications
 * - Returns null if user has disabled that notification type
 * - System announcements always bypass preferences
 */

import {
  Timestamp,
} from "firebase/firestore";
import { firestoreSet, firestoreList } from "#lib/shared/firestore/index.js";
import type {
  NotificationType,
  FeedbackNotification,
  SequenceNotification,
  SocialNotification,
  MessageNotification,
  SystemNotification,
  ModerationNotification,
} from "#lib/shared/feedback/domain/models/notification-models.js";
import { getPreferenceKeyForType } from "#lib/shared/feedback/domain/models/notification-models.js";
import { getPreferences } from "./notification-preferences-manager";
import { UserNotificationSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

const USERS_COLLECTION = "users";
const NOTIFICATIONS_SUBCOLLECTION = "notifications";

/**
 * Deduplication window in milliseconds.
 * Notifications of the same type for the same feedback within this window are considered duplicates.
 */
const DEDUP_WINDOW_MS = 30_000; // 30 seconds

/**
 * Create a feedback notification
 * Includes deduplication to prevent rapid duplicate notifications
 */
export async function createFeedbackNotification(
  userId: string,
  type: FeedbackNotification["type"],
  feedbackId: string,
  feedbackTitle: string,
  message: string,
  fromUserId: string,
  fromUserName: string
): Promise<string | null> {
  // Check user preferences
  const shouldNotifyUser = await shouldNotify(userId, type);
  if (!shouldNotifyUser) {
    return null; // User has disabled this notification type
  }

  // Check for duplicate notification within dedup window
  const isDuplicate = await isDuplicateFeedbackNotification(
    userId,
    feedbackId,
    type
  );
  if (isDuplicate) {
    return null;
  }

  const notification: Omit<FeedbackNotification, "id"> = {
    userId,
    type,
    feedbackId,
    feedbackTitle,
    message,
    createdAt: new Date(),
    read: false,
    fromUserId,
    fromUserName,
  };

  return await createNotification(userId, notification);
}

/**
 * Check if a similar feedback notification was created recently
 * Used to prevent duplicate notifications from rapid-fire clicks or double-calls
 *
 * Also treats feedback-response and feedback-resolved as duplicates of each other
 * since they serve the same purpose (notifying user about feedback update)
 */
async function isDuplicateFeedbackNotification(
  userId: string,
  feedbackId: string,
  type: NotificationType
): Promise<boolean> {
  try {
    const cutoffTime = new Date(Date.now() - DEDUP_WINDOW_MS);
    const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;

    // Types that are considered equivalent for deduplication purposes
    // (sending both response and resolved for same feedback is redundant)
    const equivalentTypes = getEquivalentNotificationTypes(type);

    // Check for each equivalent type
    for (const checkType of equivalentTypes) {
      const results = await firestoreList(
        subcollectionPath,
        UserNotificationSchema,
        {
          where: [
            { field: "feedbackId", op: "==", value: feedbackId },
            { field: "type", op: "==", value: checkType },
            { field: "createdAt", op: ">=", value: Timestamp.fromDate(cutoffTime) },
          ],
          orderBy: [{ field: "createdAt", direction: "desc" }],
          limit: 1,
        },
      );

      if (results.length > 0) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // Log but don't block notification creation on dedup check failure
    console.warn("[notification-trigger-service] Dedup check failed:", error);
    return false;
  }
}

/**
 * Get notification types that should be treated as duplicates of each other
 * For example, feedback-response and feedback-resolved are redundant
 */
function getEquivalentNotificationTypes(
  type: NotificationType
): NotificationType[] {
  // feedback-response and feedback-resolved are equivalent - user only needs one
  const responseResolvedGroup: NotificationType[] = [
    "feedback-response",
    "feedback-resolved",
  ];

  if (responseResolvedGroup.includes(type)) {
    return responseResolvedGroup;
  }

  // Default: only check for exact same type
  return [type];
}

/**
 * Create a sequence engagement notification
 */
export async function createSequenceNotification(
  userId: string,
  type: SequenceNotification["type"],
  sequenceId: string,
  sequenceTitle: string,
  message: string,
  fromUserId: string,
  fromUserName: string,
  videoUrl?: string,
  commentText?: string
): Promise<string | null> {
  // Check user preferences
  const shouldNotifyUser = await shouldNotify(userId, type);
  if (!shouldNotifyUser) {
    return null;
  }

  const notification: Omit<SequenceNotification, "id"> = {
    userId,
    type,
    sequenceId,
    sequenceTitle,
    message,
    createdAt: new Date(),
    read: false,
    fromUserId,
    fromUserName,
    ...(videoUrl && { videoUrl }),
    ...(commentText && { commentText }),
  };

  return await createNotification(userId, notification);
}

/**
 * Create a social notification
 */
export async function createSocialNotification(
  userId: string,
  type: SocialNotification["type"],
  message: string,
  fromUserId?: string,
  fromUserName?: string,
  achievementId?: string,
  achievementName?: string
): Promise<string | null> {
  // Check user preferences
  const shouldNotifyUser = await shouldNotify(userId, type);
  if (!shouldNotifyUser) {
    return null;
  }

  const notification: Omit<SocialNotification, "id"> = {
    userId,
    type,
    message,
    createdAt: new Date(),
    read: false,
    ...(fromUserId && { fromUserId }),
    ...(fromUserName && { fromUserName }),
    ...(achievementId && { achievementId }),
    ...(achievementName && { achievementName }),
  };

  return await createNotification(userId, notification);
}

/**
 * Create a message notification (for direct messages)
 */
export async function createMessageNotification(
  userId: string,
  conversationId: string,
  message: string,
  messagePreview: string,
  fromUserId: string,
  fromUserName: string
): Promise<string | null> {
  // Check user preferences
  const shouldNotifyUser = await shouldNotify(userId, "message-received");
  if (!shouldNotifyUser) {
    return null;
  }

  // Don't notify yourself
  if (userId === fromUserId) {
    return null;
  }

  const notification: Omit<MessageNotification, "id"> = {
    userId,
    type: "message-received",
    conversationId,
    message,
    messagePreview,
    createdAt: new Date(),
    read: false,
    fromUserId,
    fromUserName,
  };

  return await createNotification(userId, notification);
}

/**
 * Create a system announcement notification
 * System announcements always bypass user preferences
 */
export async function createSystemNotification(
  userId: string,
  title: string,
  message: string,
  actionUrl?: string
): Promise<string> {
  const notification: Omit<SystemNotification, "id"> = {
    userId,
    type: "system-announcement",
    title,
    message,
    createdAt: new Date(),
    read: false,
    ...(actionUrl && { actionUrl }),
  };

  // System notifications bypass preference checking
  return await createNotification(userId, notification);
}

/**
 * Create a moderation warning notification
 * Moderation warnings always bypass user preferences (like system announcements)
 */
export async function createModerationWarning(
  userId: string,
  reportId: string,
  category: string,
  adminMessage?: string
): Promise<string> {
  const notification: Omit<ModerationNotification, "id"> = {
    userId,
    type: "moderation-warning",
    reportId,
    category,
    message: `You have received a warning for ${category}. Please review our community guidelines.`,
    createdAt: new Date(),
    read: false,
    ...(adminMessage && { adminMessage }),
  };

  // Moderation warnings bypass preference checking (mandatory)
  return await createNotification(userId, notification);
}

/**
 * Check if user should receive this notification type
 */
async function shouldNotify(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  // System announcements and moderation warnings always notify
  if (type === "system-announcement" || type === "moderation-warning") {
    return true;
  }

  try {
    const preferences = await getPreferences(userId);
    const prefKey = getPreferenceKeyForType(type);

    if (!prefKey) {
      // Unknown notification type, default to notify
      return true;
    }

    return preferences[prefKey];
  } catch (error) {
    console.error("Error checking notification preferences:", error);
    // On error, default to notifying (fail open)
    return true;
  }
}

/**
 * Create notification in Firestore
 */
async function createNotification(
  userId: string,
  notification: Omit<
    | FeedbackNotification
    | SequenceNotification
    | SocialNotification
    | MessageNotification
    | SystemNotification
    | ModerationNotification,
    "id"
  >
): Promise<string> {
  const subcollectionPath = `${USERS_COLLECTION}/${userId}/${NOTIFICATIONS_SUBCOLLECTION}`;

  // firestoreSet with null id performs an addDoc (auto-generated id)
  // It also auto-sets createdAt and updatedAt via serverTimestamp
  return firestoreSet(
    subcollectionPath,
    null,
    notification as Record<string, unknown>,
  );
}
