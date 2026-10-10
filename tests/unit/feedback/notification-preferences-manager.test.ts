import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("#lib/shared/firestore/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/shared/firestore/index.js")>()),
  firestoreGet: firestoreMocks.get,
  firestoreSet: firestoreMocks.set,
}));

import {
  disableAll,
  enableAll,
  setAllEventPreferences,
} from "#lib/features/feedback/services/notification-preferences-manager.js";

describe("notification preference bulk actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.set.mockResolvedValue(undefined);
  });

  it("does not silently opt email categories in when enabling notifications", async () => {
    firestoreMocks.get.mockResolvedValue({
      notificationPreferences: {
        emailEnabled: true,
        emailMessages: true,
        emailFeedback: false,
        emailPlatformUpdates: false,
      },
    });

    await enableAll("user-1");

    expect(firestoreMocks.set).toHaveBeenCalledWith(
      "users/user-1/settings",
      "notificationPreferences",
      {
        notificationPreferences: expect.objectContaining({
          pushEnabled: true,
          emailEnabled: true,
          emailMessages: true,
          emailFeedback: false,
          emailPlatformUpdates: false,
          messageReceived: true,
        }),
      },
      { merge: true }
    );
  });

  it("turns every email channel off when disabling all notifications", async () => {
    await disableAll("user-1");

    expect(firestoreMocks.set).toHaveBeenCalledWith(
      "users/user-1/settings",
      "notificationPreferences",
      {
        notificationPreferences: expect.objectContaining({
          pushEnabled: false,
          emailEnabled: false,
          emailMessages: false,
          emailFeedback: false,
          emailPlatformUpdates: false,
          messageReceived: false,
        }),
      },
      { merge: true }
    );
  });

  it("changes event alerts without changing delivery consent", async () => {
    firestoreMocks.get.mockResolvedValue({
      notificationPreferences: {
        pushEnabled: false,
        emailEnabled: true,
        emailMessages: true,
        emailFeedback: false,
        emailPlatformUpdates: true,
        messageReceived: false,
      },
    });

    await setAllEventPreferences("user-1", true);

    expect(firestoreMocks.set).toHaveBeenCalledWith(
      "users/user-1/settings",
      "notificationPreferences",
      {
        notificationPreferences: expect.objectContaining({
          pushEnabled: false,
          emailEnabled: true,
          emailMessages: true,
          emailFeedback: false,
          emailPlatformUpdates: true,
          messageReceived: true,
          feedbackResolved: true,
          adminContentCreated: true,
        }),
      },
      { merge: true }
    );
  });
});
