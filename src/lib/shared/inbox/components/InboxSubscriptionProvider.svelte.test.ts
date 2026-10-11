import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InboxSubscriptionProvider from "./InboxSubscriptionProvider.svelte";

const mocks = vi.hoisted(() => ({
  authState: { user: { uid: "user-1" } as { uid: string } | null },
  inboxState: {
    totalUnreadCount: 1,
    setConversations: vi.fn(),
    setNotifications: vi.fn(),
  },
  subscribeToConversations: vi.fn(() => vi.fn()),
  subscribeToNotifications: vi.fn(() => vi.fn()),
  startForegroundListener: vi.fn(),
  stopForegroundListener: vi.fn(),
  isSupported: vi.fn<() => Promise<boolean>>(),
  getPermissionState: vi.fn<() => Promise<NotificationPermission>>(),
  registerToken: vi.fn(),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: mocks.authState,
}));

vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
  userPreviewState: {
    isActive: false,
    data: { profile: null },
  },
}));

vi.mock("../state/inbox-state.svelte", () => ({
  inboxState: mocks.inboxState,
}));

vi.mock("#lib/shared/messaging/services/conversation-manager.js", () => ({
  conversationService: {
    subscribeToConversations: mocks.subscribeToConversations,
  },
}));

vi.mock("#lib/shared/feedback/services/notifier.js", () => ({
  notificationService: {
    subscribeToNotifications: mocks.subscribeToNotifications,
  },
}));

vi.mock("#lib/shared/push/get-fcm-token-manager.js", () => ({
  getFCMTokenManager: () => ({
    isSupported: mocks.isSupported,
    getPermissionState: mocks.getPermissionState,
    registerToken: mocks.registerToken,
  }),
}));

vi.mock("#lib/shared/push/services/foreground-message-handler.js", () => ({
  startForegroundMessageListener: mocks.startForegroundListener,
  stopForegroundMessageListener: mocks.stopForegroundListener,
}));

describe("InboxSubscriptionProvider push registration", () => {
  beforeEach(() => {
    mocks.authState.user = { uid: "user-1" };
    mocks.inboxState.totalUnreadCount = 1;
    mocks.subscribeToConversations.mockClear();
    mocks.subscribeToNotifications.mockClear();
    mocks.startForegroundListener.mockClear();
    mocks.stopForegroundListener.mockClear();
    mocks.isSupported.mockReset();
    mocks.getPermissionState.mockReset();
    mocks.registerToken.mockReset();
    mocks.isSupported.mockResolvedValue(true);
    mocks.getPermissionState.mockResolvedValue("default");
  });

  it("does not turn an unread inbox item into a permission prompt", async () => {
    render(InboxSubscriptionProvider);

    await vi.waitFor(() => {
      expect(mocks.getPermissionState).toHaveBeenCalled();
    });

    expect(
      document.querySelector('[aria-label="Enable push notifications"]')
    ).toBeNull();
    expect(mocks.registerToken).not.toHaveBeenCalled();
  });

  it("still registers a token when permission was already granted", async () => {
    mocks.getPermissionState.mockResolvedValue("granted");

    render(InboxSubscriptionProvider);

    await vi.waitFor(() => {
      expect(mocks.registerToken).toHaveBeenCalledWith("user-1");
    });
  });
});
