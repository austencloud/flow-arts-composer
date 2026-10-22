/**
 * Notification Domain Models
 *
 * Types for tester notifications when their feedback is addressed.
 */

/**
 * All notification type discriminants. Single source of truth — the
 * NotificationType union and the Zod schema's `type` field both derive from
 * this so they can never drift apart.
 */
export const NOTIFICATION_TYPES = [
  // Feedback-related notifications
  "feedback-resolved", // Admin marked feedback as resolved
  "feedback-in-progress", // Admin started working on feedback
  "feedback-needs-info", // Admin needs more info from tester
  "feedback-response", // Admin sent a message
  // Sequence engagement notifications
  "sequence-liked", // Someone liked your sequence
  // Social notifications
  "user-followed", // Someone followed you
  "achievement-unlocked", // User unlocked an achievement
  // Messaging notifications
  "message-received", // Someone sent you a direct message
  // Admin notifications
  "admin-new-user-signup", // A new user signed up (admin-only)
  // Pulse activity notifications (admin-only ambient awareness)
  "admin-user-returned", // A known user opened the app again
  "admin-qr-scan", // Someone scanned a shared QR code
  "admin-content-created", // A user saved a sequence or created a collection
  "admin-site-visit", // A visitor without an account opened the site
  "admin-parity-audit", // The scheduled data-integrity audit found drift or failed
  // System notifications
  "system-announcement", // Important system announcements
  // Moderation notifications
  "moderation-warning", // User received a moderation warning
] as const;

/**
 * Notification type classification
 */
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Base notification interface
 * Stored per-user in users/{userId}/notifications/{notificationId}
 */
export interface BaseNotification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  createdAt: Date;
  read: boolean;
  readAt?: Date;

  // Who triggered the notification (optional for system notifications)
  fromUserId?: string;
  fromUserName?: string;
}

/**
 * Feedback-related notification
 */
export interface FeedbackNotification extends BaseNotification {
  type:
    | "feedback-resolved"
    | "feedback-in-progress"
    | "feedback-needs-info"
    | "feedback-response";
  feedbackId: string;
  feedbackTitle: string;
  fromUserId: string;
  fromUserName: string;
}

/**
 * Sequence-related notification
 */
export interface SequenceNotification extends BaseNotification {
  type: "sequence-liked";
  sequenceId: string;
  sequenceTitle: string;
  fromUserId: string;
  fromUserName: string;
}

/**
 * Social notification
 */
export interface SocialNotification extends BaseNotification {
  type: "user-followed" | "achievement-unlocked";
  fromUserId?: string;
  fromUserName?: string;
  // Achievement-specific
  achievementId?: string;
  achievementName?: string;
}

/**
 * Message notification (direct messages)
 */
export interface MessageNotification extends BaseNotification {
  type: "message-received";
  conversationId: string;
  fromUserId: string;
  fromUserName: string;
  messagePreview: string;
}

/**
 * System notification
 */
export interface SystemNotification extends BaseNotification {
  type: "system-announcement";
  title: string;
  actionUrl?: string;
}

/**
 * Admin notification (for admin-only events)
 */
export interface AdminNotification extends BaseNotification {
  type: "admin-new-user-signup";
  newUserId: string;
  newUserEmail: string | null;
  newUserDisplayName: string;
  /** Exact PostHog browser session the signup happened in, when captured. */
  postHogSessionId?: string;
}

/**
 * Pulse activity notification (admin-only ambient awareness).
 * Written server-side by the pulse cloud functions; payload fields vary
 * by event source so they are all optional.
 */
export interface PulseNotification extends BaseNotification {
  type:
    | "admin-user-returned"
    | "admin-qr-scan"
    | "admin-content-created"
    | "admin-site-visit";
  returnedUserId?: string;
  /** Exact PostHog browser session that produced a returning-user alert. */
  postHogSessionId?: string;
  shortCode?: string;
  scanCity?: string | null;
  scanCountry?: string | null;
  /** Latest scan's coordinates — drives the map fly-to on notification click. */
  scanLat?: number | null;
  scanLng?: number | null;
  /** How many scans this rolling digest has coalesced (1 = single scan). */
  scanCount?: number;
  /** Display name of a signed-in scanner (set on the first scan of a digest). */
  fromUserName?: string;
  contentType?: "sequence" | "collection";
  sequenceId?: string;
  collectionId?: string;
  word?: string;
  collectionName?: string;
  /** How many visitors this rolling site-visit digest has coalesced. */
  visitCount?: number;
}

export interface ParityAuditViolation {
  source: "reconcile" | "shortcode";
  id?: string;
  code?: string;
  ownerId?: string | null;
  classification: string;
  detail?: string;
  storedWord?: string;
  expectedWord?: string;
  changedKeys?: string[];
}

/**
 * Admin-only data-integrity alert written by the scheduled parity audit.
 * The report summary travels with the notification so the destination still
 * works on another device, where the scheduler's local JSON file is absent.
 */
export interface ParityAuditNotification extends BaseNotification {
  type: "admin-parity-audit";
  auditStatus: "violations" | "failed";
  actionUrl: string;
  reportFile?: string;
  reportGeneratedAt?: string;
  auditReconcileCount: number;
  auditShortcodeCount: number;
  auditViolations: ParityAuditViolation[];
  auditError?: string;
}

/**
 * Moderation notification (warning issued to user)
 */
export interface ModerationNotification extends BaseNotification {
  type: "moderation-warning";
  reportId: string;
  category: string; // What the warning was for (e.g., "Harassment", "Spam")
  adminMessage?: string; // Optional message from admin
}

/**
 * Union type for all notifications
 */
export type UserNotification =
  | FeedbackNotification
  | SequenceNotification
  | SocialNotification
  | MessageNotification
  | SystemNotification
  | AdminNotification
  | PulseNotification
  | ParityAuditNotification
  | ModerationNotification;

/**
 * Legacy alias for backward compatibility
 * @deprecated Use FeedbackNotification instead
 */
export type TesterNotification = FeedbackNotification;

/**
 * Notification preferences - stored per user
 * Controls which notification types the user wants to receive
 */
export interface NotificationPreferences {
  // Push notifications master toggle
  pushEnabled: boolean;

  // Email notifications are opt-in and use their own category controls.
  emailEnabled: boolean;
  emailMessages: boolean;
  emailFeedback: boolean;
  emailPlatformUpdates: boolean;

  // Feedback notifications
  feedbackResolved: boolean;
  feedbackInProgress: boolean;
  feedbackNeedsInfo: boolean;
  feedbackResponse: boolean;

  // Sequence engagement notifications
  sequenceSaved: boolean;
  sequenceVideoSubmitted: boolean;
  sequenceLiked: boolean;
  sequenceCommented: boolean;

  // Social notifications
  userFollowed: boolean;
  achievementUnlocked: boolean;

  // Messaging notifications
  messageReceived: boolean;

  // Admin notifications (only relevant for admin users)
  adminNewUserSignup: boolean;
  adminUserReturned: boolean;
  adminQrScan: boolean;
  adminContentCreated: boolean;
  adminSiteVisit: boolean;

  // System notifications (cannot be disabled)
  // systemAnnouncement is always enabled
}

/**
 * Default notification preferences (all enabled by default)
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: false,
  emailMessages: false,
  emailFeedback: false,
  emailPlatformUpdates: false,
  feedbackResolved: true,
  feedbackInProgress: true,
  feedbackNeedsInfo: true,
  feedbackResponse: true,
  sequenceSaved: true,
  sequenceVideoSubmitted: true,
  sequenceLiked: true,
  sequenceCommented: true,
  userFollowed: true,
  achievementUnlocked: true,
  messageReceived: true,
  adminNewUserSignup: true,
  adminUserReturned: true,
  adminQrScan: true,
  adminContentCreated: true,
  adminSiteVisit: true,
};

export function getPreferenceKeyForType(
  type: NotificationType
): keyof NotificationPreferences | null {
  const typeToKey: Record<string, keyof NotificationPreferences> = {
    "feedback-resolved": "feedbackResolved",
    "feedback-in-progress": "feedbackInProgress",
    "feedback-needs-info": "feedbackNeedsInfo",
    "feedback-response": "feedbackResponse",
    "sequence-liked": "sequenceLiked",
    "user-followed": "userFollowed",
    "achievement-unlocked": "achievementUnlocked",
    "message-received": "messageReceived",
    "admin-new-user-signup": "adminNewUserSignup",
    "admin-user-returned": "adminUserReturned",
    "admin-qr-scan": "adminQrScan",
    "admin-content-created": "adminContentCreated",
    "admin-site-visit": "adminSiteVisit",
  };

  return typeToKey[type] || null;
}

/**
 * Notification display configuration
 */
export const NOTIFICATION_TYPE_CONFIG: Record<
  NotificationType,
  { label: string; color: string; icon: string; actionLabel: string }
> = {
  // Feedback notifications
  "feedback-resolved": {
    label: "Feedback Resolved",
    color: "#10b981",
    icon: "fa-check-circle",
    actionLabel: "View Details",
  },
  "feedback-in-progress": {
    label: "Being Worked On",
    color: "#f59e0b",
    icon: "fa-spinner",
    actionLabel: "View Details",
  },
  "feedback-needs-info": {
    label: "More Info Needed",
    color: "#8b5cf6",
    icon: "fa-question-circle",
    actionLabel: "Respond",
  },
  "feedback-response": {
    label: "Admin Response",
    color: "#3b82f6",
    icon: "fa-comment",
    actionLabel: "View Message",
  },
  // Sequence notifications
  "sequence-liked": {
    label: "Sequence Liked",
    color: "#ec4899",
    icon: "fa-heart",
    actionLabel: "View Sequence",
  },
  // Social notifications
  "user-followed": {
    label: "New Follower",
    color: "#06b6d4",
    icon: "fa-user-plus",
    actionLabel: "View Profile",
  },
  "achievement-unlocked": {
    label: "Achievement Unlocked",
    color: "#f59e0b",
    icon: "fa-trophy",
    actionLabel: "View Achievement",
  },
  // Messaging notifications
  "message-received": {
    label: "New Message",
    color: "#8b5cf6",
    icon: "fa-envelope",
    actionLabel: "View Message",
  },
  // Admin notifications
  "admin-new-user-signup": {
    label: "New User Signup",
    color: "#10b981",
    icon: "fa-user-plus",
    actionLabel: "View User",
  },
  "admin-user-returned": {
    label: "User Returned",
    color: "#06b6d4",
    icon: "fa-door-open",
    actionLabel: "View User",
  },
  "admin-qr-scan": {
    label: "QR Scan",
    color: "#8b5cf6",
    icon: "fa-qrcode",
    actionLabel: "View Activity",
  },
  "admin-content-created": {
    label: "Content Created",
    color: "#f59e0b",
    icon: "fa-wand-magic-sparkles",
    actionLabel: "View Activity",
  },
  "admin-site-visit": {
    label: "Site Visitor",
    color: "#14b8a6",
    icon: "fa-earth-americas",
    actionLabel: "Watch Visit",
  },
  "admin-parity-audit": {
    label: "Parity Audit",
    color: "#f97316",
    icon: "fa-shield-halved",
    actionLabel: "Open Report",
  },
  // System notifications
  "system-announcement": {
    label: "System Announcement",
    color: "#6366f1",
    icon: "fa-bell",
    actionLabel: "Learn More",
  },
  // Moderation notifications
  "moderation-warning": {
    label: "Account Warning",
    color: "#ef4444", // Red - serious
    icon: "fa-exclamation-triangle",
    actionLabel: "View Details",
  },
};
