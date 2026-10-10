import { describe, expect, it } from "vitest";
import { getNotificationPreferenceGroup } from "#lib/features/feedback/domain/notification-preference-group.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "#lib/shared/feedback/domain/models/notification-models.js";

describe("notification preference groups", () => {
  it("keeps the chat preference in a visible Messages group", () => {
    expect(getNotificationPreferenceGroup("message-received")).toBe("messages");
  });

  it("keeps preference-backed event families in their expected groups", () => {
    expect(getNotificationPreferenceGroup("feedback-resolved")).toBe(
      "feedback"
    );
    expect(getNotificationPreferenceGroup("sequence-liked")).toBe("engagement");
    expect(getNotificationPreferenceGroup("user-followed")).toBe("social");
    expect(getNotificationPreferenceGroup("admin-qr-scan")).toBe("admin");
  });

  it("leaves every email category off until the user opts in", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.emailMessages).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.emailFeedback).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.emailPlatformUpdates).toBe(false);
  });
});
