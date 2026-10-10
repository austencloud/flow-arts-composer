import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "#lib/shared/feedback/domain/models/notification-models.js";
import NotificationPreferencesPanel from "./NotificationPreferencesPanel.svelte";

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  togglePreference: vi.fn(),
  enableAll: vi.fn(),
  disableAll: vi.fn(),
  setAllEventPreferences: vi.fn(),
  getRegistrationState: vi.fn(),
  getSetupState: vi.fn(),
  enableForCurrentDevice: vi.fn(),
  unregisterToken: vi.fn(),
  showUserError: vi.fn(),
}));

vi.mock(
  "#lib/features/feedback/services/notification-preferences-manager.js",
  () => ({
    getPreferences: mocks.getPreferences,
    savePreferences: mocks.savePreferences,
    togglePreference: mocks.togglePreference,
    enableAll: mocks.enableAll,
    disableAll: mocks.disableAll,
    setAllEventPreferences: mocks.setAllEventPreferences,
  })
);

vi.mock("#lib/shared/push/get-fcm-token-manager.js", () => ({
  getFCMTokenManager: () => ({
    getRegistrationState: mocks.getRegistrationState,
    getSetupState: mocks.getSetupState,
    enableForCurrentDevice: mocks.enableForCurrentDevice,
    unregisterToken: mocks.unregisterToken,
  }),
}));

vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: mocks.showUserError }),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    isAuthenticated: true,
    isAdmin: false,
    user: {
      uid: "notification-test-user",
      email: "spinner@example.com",
      emailVerified: true,
    },
  },
}));

vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
  userPreviewState: { isActive: false, data: null },
  getPreviewNotificationPreferences: () => null,
}));

const translations: Record<string, string> = {
  feedback_notification_prefs: "Notification Preferences",
  feedback_notification_prefs_subtitle: "Choose notifications",
  feedback_delivery_methods: "Delivery methods",
  feedback_delivery_methods_desc: "Choose where notifications can reach you",
  feedback_in_app_alerts: "Alert types",
  feedback_in_app_alerts_desc:
    "These choices feed your inbox and push notifications.",
  feedback_push_notifications: "Push notifications",
  feedback_push_setup: "Set up",
  feedback_push_setup_desc: "Tap to set up push on this device",
  feedback_setup_push: "Set up push notifications on this device",
  feedback_turn_push_on: "Turn on push notifications on this device",
  feedback_turn_push_off: "Turn off push notifications on this device",
  feedback_retry_push: "Retry push notification setup",
  feedback_push_retry: "Retry",
  feedback_push_failed_desc: "Push setup failed. Try again.",
  feedback_email_notifications: "Email notifications",
  feedback_email_off: "Email off",
  feedback_email_off_desc: "Off until you choose to receive email",
  feedback_turn_email_on: "Turn on email notifications",
  feedback_turn_email_off: "Turn off email notifications",
  feedback_state_on: "On",
  feedback_state_off: "Off",
  feedback_email_categories: "Email me about",
  feedback_email_categories_desc: "Pick the updates you want",
  feedback_email_messages: "Chat messages",
  feedback_email_messages_desc: "New chat messages",
  feedback_email_feedback: "Feedback outcomes",
  feedback_email_feedback_desc: "Feedback progress and outcomes",
  feedback_email_platform_updates: "Product updates",
  feedback_email_platform_updates_desc: "New releases",
  feedback_group_messages: "Messages",
  feedback_group_messages_desc: "Choose chat alerts",
  feedback_group_feedback: "Feedback",
  feedback_group_feedback_desc: "Choose feedback alerts",
  feedback_group_activity: "Community activity",
  feedback_group_activity_desc: "Choose community alerts",
  feedback_group_admin: "Admin",
  feedback_group_admin_desc: "Choose admin alerts",
  feedback_enable_all: "All on",
  feedback_disable_all: "All off",
  feedback_system_notice: "System notices stay on",
  feedback_notif_desc_message: "When someone sends you a message",
  feedback_preferences_load_failed: "Notification settings couldn't load",
  feedback_preferences_load_failed_desc:
    "Your saved choices are still safe. Try loading them again.",
  feedback_push_check_failed:
    "Couldn't check push notifications on this device. Tap Retry to check again.",
  feedback_preference_update_failed:
    "That notification choice couldn't be saved. Try again.",
  feedback_bulk_update_failed:
    "Couldn't update every alert. Your existing choices are unchanged.",
  feedback_push_update_failed: "Couldn't update push notifications. Try again.",
  feedback_email_update_failed:
    "Couldn't update email notifications. Try again.",
  feedback_email_unavailable: "Unavailable",
  feedback_email_verify: "Verify email",
  common_retry: "Retry",
};

vi.mock("#lib/shared/i18n/i18n.svelte.js", () => ({
  t: (key: string) => translations[key] ?? key,
}));

describe("NotificationPreferencesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPreferences.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
    });
    mocks.getRegistrationState.mockResolvedValue("setup-required");
    mocks.getSetupState.mockResolvedValue("setup-required");
    mocks.enableForCurrentDevice.mockResolvedValue("ready");
    mocks.savePreferences.mockResolvedValue(undefined);
    mocks.togglePreference.mockResolvedValue(undefined);
    mocks.setAllEventPreferences.mockResolvedValue(undefined);
  });

  it("shows chat controls and does not claim unregistered push is active", async () => {
    render(NotificationPreferencesPanel);

    await expect
      .element(page.getByRole("heading", { name: "Delivery methods" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Messages" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Alert types" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Admin" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByText("When someone sends you a message"))
      .toBeVisible();

    const pushAction = page.getByRole("button", {
      name: "Set up push notifications on this device",
    });
    await expect.element(pushAction).not.toHaveAttribute("aria-pressed");
    await expect
      .element(page.getByText("Set up", { exact: true }))
      .toBeVisible();

    await expect
      .element(page.getByRole("switch", { name: "New Message" }))
      .toHaveAttribute("aria-checked", "true");
  });

  it("starts email as an explicit opt-in with all requested categories", async () => {
    render(NotificationPreferencesPanel);

    const emailToggle = page.getByRole("switch", {
      name: "Turn on email notifications",
    });
    await expect.element(emailToggle).toHaveAttribute("aria-checked", "false");
    await expect
      .element(page.getByText("Chat messages", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("Feedback outcomes", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("Product updates", { exact: true }))
      .toBeVisible();

    await emailToggle.click();
    await expect.poll(() => mocks.savePreferences.mock.calls.length).toBe(1);
    expect(mocks.savePreferences).toHaveBeenCalledWith(
      "notification-test-user",
      expect.objectContaining({
        emailEnabled: true,
        emailMessages: true,
        emailFeedback: true,
        emailPlatformUpdates: true,
      })
    );
  });

  it("retries failed push setup instead of turning the account preference off", async () => {
    mocks.getRegistrationState.mockResolvedValueOnce("failed");

    render(NotificationPreferencesPanel);

    const retryPush = page.getByRole("button", {
      name: "Retry push notification setup",
    });
    await expect.element(retryPush).toBeVisible();
    await retryPush.click();

    await expect
      .poll(() => mocks.enableForCurrentDevice.mock.calls.length)
      .toBe(1);
    expect(mocks.savePreferences).toHaveBeenCalledWith(
      "notification-test-user",
      expect.objectContaining({ pushEnabled: true })
    );
  });

  it("shows a retryable state instead of rendering defaults after load failure", async () => {
    mocks.getPreferences.mockRejectedValueOnce(new Error("offline"));

    render(NotificationPreferencesPanel);

    await expect
      .element(
        page.getByRole("heading", {
          name: "Notification settings couldn't load",
        })
      )
      .toBeVisible();
    expect(mocks.showUserError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Notification settings couldn't load",
        context: expect.objectContaining({
          action: "load-notification-preferences",
        }),
      })
    );

    await page.getByRole("button", { name: "Retry" }).click();
    await expect
      .element(page.getByRole("heading", { name: "Delivery methods" }))
      .toBeVisible();
  });

  it("surfaces a bulk update failure without changing individual choices", async () => {
    mocks.setAllEventPreferences.mockRejectedValueOnce(
      new Error("write failed")
    );

    render(NotificationPreferencesPanel);

    const allOn = page.getByRole("button", { name: "All on" });
    await expect.element(allOn).toBeVisible();
    await allOn.click();

    await expect.poll(() => mocks.showUserError.mock.calls.length).toBe(1);
    expect(mocks.showUserError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Couldn't update every alert. Your existing choices are unchanged.",
        context: expect.objectContaining({ action: "enable-all-alerts" }),
      })
    );
  });
});
