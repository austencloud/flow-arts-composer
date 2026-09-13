import { flushSync } from "svelte";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "$lib/shared/messaging/domain/models/message-models";
import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";
import { inboxState } from "../state/inbox-state.svelte";
import InboxDrawer from "./InboxDrawer.svelte";

interface MessageListener {
  conversationId: string;
  emit: (messages: Message[]) => void;
  active: boolean;
}

const mocks = vi.hoisted(() => ({
  listeners: [] as MessageListener[],
  getConversation: vi.fn(),
  markAsRead: vi.fn(),
  handleModuleChange: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    user: { uid: "current-user", displayName: "Austen", photoURL: null },
    isAdmin: false,
    isFullAccount: true,
    loading: false,
    initialized: true,
  },
  isAdmin: () => false,
  isEffectiveAdmin: () => false,
  isLoading: () => false,
  isInitialized: () => true,
  getUser: () => ({ uid: "current-user" }),
  getUserState: () => ({ user: { uid: "current-user" } }),
  getEffectiveUserId: () => "current-user",
  getEffectiveRole: () => "user",
  getRole: () => "user",
  awaitAuthSettled: async () => undefined,
}));

vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  userPreviewState: { isActive: false, data: {} },
  isPreviewReadOnly: () => false,
  getEffectiveUserId: (userId: string | null) => userId,
  getEffectiveDisplayName: (name: string | null) => name,
  getEffectivePhotoURL: (url: string | null) => url,
}));

vi.mock("$lib/shared/feedback/services/notifier", () => ({
  notificationService: {
    markAllAsRead: mocks.markAllNotificationsRead,
    subscribeToNotifications: () => () => undefined,
  },
}));

vi.mock("$lib/shared/messaging/services/conversation-manager", () => ({
  conversationService: {
    getConversation: mocks.getConversation,
    markAllAsRead: vi.fn(),
  },
}));

vi.mock("$lib/shared/messaging/services/messenger", () => ({
  messagingService: {
    // Records every listener so a test can emit from one the drawer should
    // already have torn down.
    subscribeToMessages(
      conversationId: string,
      callback: (messages: Message[]) => void
    ) {
      const listener: MessageListener = {
        conversationId,
        emit: callback,
        active: true,
      };
      mocks.listeners.push(listener);
      return () => {
        listener.active = false;
      };
    },
    subscribeToTyping: () => () => undefined,
    markAsRead: mocks.markAsRead,
    setTyping: vi.fn(async () => undefined),
  },
}));

vi.mock("$lib/shared/navigation-coordinator/navigation-coordinator.svelte", () => ({
  moduleSections: () => [],
  handleSectionChange: vi.fn(),
  handleModuleChange: mocks.handleModuleChange,
}));


vi.mock("../get-message-delivery-repository", () => ({
  getMessageDeliveryRepository: () => ({
    listDrafts: async () => [],
    listOutbox: async () => [],
    getDraft: async () => undefined,
    putDraft: async () => undefined,
    deleteDraft: async () => undefined,
    putOutbox: async () => undefined,
    deleteOutbox: async () => undefined,
    promoteDraftToOutbox: async () => undefined,
    purgeUser: async () => undefined,
  }),
}));

vi.mock("../get-message-delivery-coordinator", () => ({
  getMessageDeliveryCoordinator: () => ({ deliver: async () => undefined }),
}));

vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
}));

vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: () => ({}),
}));

vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: () => ({ createShortCode: vi.fn() }),
}));

vi.mock("$lib/shared/messaging/get-message-image-sender", () => ({
  getMessageImageSender: () => ({
    send: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  }),
}));

function preview(id: string, name: string): ConversationPreview {
  return {
    id,
    type: "direct",
    otherParticipant: {
      userId: `${id}-other`,
      displayName: name,
      username: name.toLowerCase(),
      joinedAt: new Date("2026-07-01T12:00:00Z"),
    },
    unreadCount: 0,
    updatedAt: new Date("2026-07-28T12:00:00Z"),
  } as ConversationPreview;
}

function conversation(id: string, name: string) {
  return {
    id,
    type: "direct" as const,
    participants: ["current-user", `${id}-other`],
    participantInfo: {
      "current-user": {
        userId: "current-user",
        displayName: "Austen",
        joinedAt: new Date("2026-07-01T12:00:00Z"),
      },
      [`${id}-other`]: {
        userId: `${id}-other`,
        displayName: name,
        joinedAt: new Date("2026-07-01T12:00:00Z"),
      },
    },
    unreadCount: {},
    createdAt: new Date("2026-07-01T12:00:00Z"),
    updatedAt: new Date("2026-07-28T12:00:00Z"),
  };
}

function message(conversationId: string, content: string): Message {
  return {
    id: `${conversationId}-message`,
    conversationId,
    senderId: `${conversationId}-other`,
    senderName: "Them",
    content,
    createdAt: new Date("2026-07-28T12:00:00Z"),
    readBy: [],
  };
}

function listenerFor(conversationId: string): MessageListener {
  const listener = mocks.listeners.find(
    (entry) => entry.conversationId === conversationId
  );
  if (!listener) {
    throw new Error(`No message listener was opened for ${conversationId}`);
  }
  return listener;
}

/**
 * Clicked through the DOM rather than the browser driver: the drawer's own
 * entrance animation never settles in the runner, so the driver's
 * visible-enabled-stable wait times out on controls that are already present
 * and interactive.
 */
function clickByLabel(label: string | RegExp): void {
  const buttons = Array.from(document.querySelectorAll("button"));
  const target = buttons.find((button) => {
    const name = button.getAttribute("aria-label") ?? "";
    return typeof label === "string" ? name === label : label.test(name);
  });
  if (!target) {
    throw new Error(`No button matched ${label}`);
  }
  target.click();
  flushSync();
}

function openConversation(name: string): void {
  clickByLabel(new RegExp(`^Conversation with ${name}`));
}

describe("InboxDrawer thread subscriptions", () => {
  beforeEach(() => {
    mocks.listeners.length = 0;
    mocks.getConversation.mockReset();
    mocks.getConversation.mockImplementation(async (id: string) =>
      conversation(id, id === "conversation-a" ? "Paul" : "Morgan")
    );
    mocks.markAsRead.mockReset();
    mocks.markAsRead.mockResolvedValue(undefined);
    inboxState.close();
    inboxState.setConversations([
      preview("conversation-a", "Paul"),
      preview("conversation-b", "Morgan"),
    ]);
    inboxState.open("messages");
  });

  it("stops the previous thread's listener when another conversation opens", async () => {
    render(InboxDrawer);

    openConversation("Paul");
    await vi.waitFor(() => expect(listenerFor("conversation-a")).toBeTruthy());

    clickByLabel("Back to conversations");
    openConversation("Morgan");
    await vi.waitFor(() => expect(listenerFor("conversation-b")).toBeTruthy());

    expect(listenerFor("conversation-a").active).toBe(false);
  });

  it("keeps the open thread when a closed conversation receives a message", async () => {
    render(InboxDrawer);

    openConversation("Paul");
    await vi.waitFor(() => expect(listenerFor("conversation-a")).toBeTruthy());
    clickByLabel("Back to conversations");
    openConversation("Morgan");
    await vi.waitFor(() => expect(listenerFor("conversation-b")).toBeTruthy());

    listenerFor("conversation-b").emit([
      message("conversation-b", "Morgan's thread"),
    ]);
    // A message arriving in the conversation the user LEFT must not replace the
    // thread on screen. The stale listener used to call setMessages, so Paul's
    // message appeared inside Morgan's open thread.
    listenerFor("conversation-a").emit([
      message("conversation-a", "Paul's thread"),
    ]);

    await vi.waitFor(() => {
      expect(inboxState.messages.map((entry) => entry.content)).toEqual([
        "Morgan's thread",
      ]);
    });
  });

  it("ignores a conversation load that resolves after a newer selection", async () => {
    let releasePaul: (() => void) | undefined;
    const paulLoaded = new Promise<void>((resolve) => {
      releasePaul = resolve;
    });
    mocks.getConversation.mockImplementation(async (id: string) => {
      if (id === "conversation-a") await paulLoaded;
      return conversation(id, id === "conversation-a" ? "Paul" : "Morgan");
    });

    render(InboxDrawer);

    openConversation("Paul");
    openConversation("Morgan");
    await vi.waitFor(() => expect(listenerFor("conversation-b")).toBeTruthy());

    // The abandoned lookup finishes last. It must not select its conversation,
    // attach a listener, or mark a thread the user never reached as read.
    releasePaul?.();
    await paulLoaded;
    await vi.waitFor(() => expect(mocks.getConversation).toHaveBeenCalledTimes(2));

    expect(inboxState.selectedConversation?.id).toBe("conversation-b");
    expect(
      mocks.listeners.map((listener) => listener.conversationId)
    ).toEqual(["conversation-b"]);
    expect(mocks.markAsRead.mock.calls.flat()).toEqual(["conversation-b"]);
  });

  it("stops listening when the inbox closes", async () => {
    render(InboxDrawer);

    openConversation("Paul");
    await vi.waitFor(() => expect(listenerFor("conversation-a")).toBeTruthy());

    clickByLabel("Close inbox");

    await vi.waitFor(() => {
      expect(listenerFor("conversation-a").active).toBe(false);
    });
  });
});
