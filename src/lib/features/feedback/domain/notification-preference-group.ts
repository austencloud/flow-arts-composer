import type { NotificationType } from "#lib/shared/feedback/domain/models/notification-models.js";

export type NotificationPreferenceGroupId =
  | "messages"
  | "feedback"
  | "engagement"
  | "social"
  | "admin";

/**
 * Keeps every preference-backed notification type attached to a visible
 * settings group. Returning null means the notification is intentionally
 * always-on or does not expose a user preference.
 */
export function getNotificationPreferenceGroup(
  type: NotificationType
): NotificationPreferenceGroupId | null {
  if (type === "message-received") return "messages";
  if (type.startsWith("feedback-")) return "feedback";
  if (type.startsWith("sequence-")) return "engagement";
  if (type === "user-followed" || type === "achievement-unlocked") {
    return "social";
  }
  if (type.startsWith("admin-") && type !== "admin-parity-audit") {
    return "admin";
  }
  return null;
}
