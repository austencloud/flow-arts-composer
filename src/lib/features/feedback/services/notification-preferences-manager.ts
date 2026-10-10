import { firestoreGet, firestoreSet } from "#lib/shared/firestore/index.js";
import type { NotificationPreferences } from "#lib/shared/feedback/domain/models/notification-models.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "#lib/shared/feedback/domain/models/notification-models.js";
import { NotificationPreferencesDocSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

const preferencesCollection = (userId: string) => `users/${userId}/settings`;
const PREFERENCES_DOCUMENT = "notificationPreferences";
const PREFERENCES_FIELD = "notificationPreferences";

const EVENT_ALERT_KEYS = [
  "feedbackResolved",
  "feedbackInProgress",
  "feedbackNeedsInfo",
  "feedbackResponse",
  "sequenceSaved",
  "sequenceVideoSubmitted",
  "sequenceLiked",
  "sequenceCommented",
  "userFollowed",
  "achievementUnlocked",
  "messageReceived",
  "adminNewUserSignup",
  "adminUserReturned",
  "adminQrScan",
  "adminContentCreated",
] as const satisfies readonly (keyof NotificationPreferences)[];

/**
 * Get notification preferences for a user
 * Returns default preferences if none are set
 */
export async function getPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    const userDoc = await firestoreGet(
      preferencesCollection(userId),
      PREFERENCES_DOCUMENT,
      NotificationPreferencesDocSchema
    );

    if (!userDoc) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    const prefs = userDoc.notificationPreferences;

    if (!prefs) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    // Merge with defaults to ensure all fields are present
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...prefs,
    };
  } catch (error) {
    console.error("Error loading notification preferences:", error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Save notification preferences for a user
 */
export async function savePreferences(
  userId: string,
  preferences: NotificationPreferences
): Promise<void> {
  try {
    await firestoreSet(
      preferencesCollection(userId),
      PREFERENCES_DOCUMENT,
      { [PREFERENCES_FIELD]: preferences } as Record<string, unknown>,
      { merge: true }
    );
  } catch (error) {
    console.error("Error saving notification preferences:", error);
    throw error;
  }
}

/**
 * Toggle a specific notification preference
 */
export async function togglePreference(
  userId: string,
  key: keyof NotificationPreferences
): Promise<void> {
  const current = await getPreferences(userId);
  const updated = {
    ...current,
    [key]: !current[key],
  };
  await savePreferences(userId, updated);
}

/**
 * Set every event-level alert without changing push registration or email
 * consent. Channel choices stay explicit because they have different setup and
 * privacy contracts from an in-app alert preference.
 */
export async function setAllEventPreferences(
  userId: string,
  enabled: boolean
): Promise<void> {
  const current = await getPreferences(userId);
  const updated = { ...current };

  for (const key of EVENT_ALERT_KEYS) {
    updated[key] = enabled;
  }

  await savePreferences(userId, updated);
}

/**
 * Enable all notifications
 */
export async function enableAll(userId: string): Promise<void> {
  const current = await getPreferences(userId);
  const allEnabled: NotificationPreferences = {
    pushEnabled: true,
    // A generic bulk action must not quietly opt someone into email. Email has
    // its own explicit switch and keeps the choices the user already made.
    emailEnabled: current.emailEnabled,
    emailMessages: current.emailMessages,
    emailFeedback: current.emailFeedback,
    emailPlatformUpdates: current.emailPlatformUpdates,
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
  };
  await savePreferences(userId, allEnabled);
}

/**
 * Disable all notifications (except system announcements)
 */
export async function disableAll(userId: string): Promise<void> {
  const allDisabled: NotificationPreferences = {
    pushEnabled: false,
    emailEnabled: false,
    emailMessages: false,
    emailFeedback: false,
    emailPlatformUpdates: false,
    feedbackResolved: false,
    feedbackInProgress: false,
    feedbackNeedsInfo: false,
    feedbackResponse: false,
    sequenceSaved: false,
    sequenceVideoSubmitted: false,
    sequenceLiked: false,
    sequenceCommented: false,
    userFollowed: false,
    achievementUnlocked: false,
    messageReceived: false,
    adminNewUserSignup: false,
    adminUserReturned: false,
    adminQrScan: false,
    adminContentCreated: false,
  };
  await savePreferences(userId, allDisabled);
}
