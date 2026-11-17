import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageOutboxRecord } from "#lib/shared/inbox/domain/message-delivery-models.js";

const fakes = vi.hoisted(() => {
  const outbox = new Map<string, MessageOutboxRecord>();
  return {
    user: {
      current: null as null | {
        uid: string;
        email: string;
        displayName: string;
        photoURL: null;
      },
    },
    outbox,
    repository: {
      putOutbox: vi.fn(async (row: MessageOutboxRecord) => {
        outbox.set(row.id, structuredClone(row));
      }),
      deleteOutbox: vi.fn(async (id: string) => {
        outbox.delete(id);
      }),
      listOutbox: vi.fn(async (userId: string) =>
        [...outbox.values()].filter((row) => row.userId === userId)
      ),
    },
    getOrCreateConversation: vi.fn(),
    sendMessage: vi.fn(),
    logActivity: vi.fn(),
    addDoc: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: fakes.addDoc,
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
  getStorageInstance: vi.fn(async () => ({})),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    get user() {
      return fakes.user.current;
    },
  },
}));
vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
  userPreviewState: { isActive: false, data: { profile: null } },
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));
vi.mock("#lib/shared/feedback/utils/device-context-capturer.js", () => ({
  captureDeviceContext: vi.fn(() => ({})),
}));
vi.mock("#lib/shared/messaging/services/conversation-manager.js", () => ({
  conversationService: {
    getOrCreateConversation: fakes.getOrCreateConversation,
    directConversationIdWith: (otherUserId: string) =>
      [fakes.user.current?.uid ?? "", otherUserId].sort().join("_"),
  },
}));
vi.mock("#lib/shared/messaging/services/messenger.js", () => ({
  messagingService: { sendMessage: fakes.sendMessage },
}));
vi.mock("#lib/shared/inbox/get-message-delivery-repository.js", () => ({
  getMessageDeliveryRepository: () => fakes.repository,
}));
vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logActivity: fakes.logActivity,
}));

import {
  ADMIN_USER_ID,
  retryUnsentFeedbackMessages,
  submitFeedback,
} from "../feedback-submission-service";

const PERSON = {
  uid: "person-1",
  email: "person@example.test",
  displayName: "Person",
  photoURL: null,
};

/** The send is fire-and-forget; let its promise chain settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function eventsNamed(name: string): unknown[] {
  return fakes.logActivity.mock.calls
    .filter(([event]) => event === name)
    .map(([, , properties]) => properties);
}

beforeEach(() => {
  fakes.user.current = PERSON;
  fakes.outbox.clear();
  vi.clearAllMocks();
  fakes.addDoc.mockResolvedValue({ id: "fb1" });
  fakes.getOrCreateConversation.mockResolvedValue({
    conversation: { id: "conversation-1" },
    isNew: true,
  });
  fakes.sendMessage.mockResolvedValue({});
});

describe("feedback thread message", () => {
  it("sends the person's own words as an ordinary message with the feedback card", async () => {
    const words =
      "The tempo slider resets every time I switch tabs, please keep my setting.";
    await submitFeedback(
      { type: "bug", title: "", description: words },
      "create",
      "construct"
    );
    await settle();

    expect(fakes.getOrCreateConversation).toHaveBeenCalledWith(ADMIN_USER_ID, {
      silent: true,
    });
    expect(fakes.sendMessage).toHaveBeenCalledTimes(1);
    const sent = fakes.sendMessage.mock.calls[0]![0];
    expect(sent.content).toBe(words);
    expect(sent.messageId).toBe("feedback-fb1");
    expect(sent.attachments).toEqual([
      expect.objectContaining({
        type: "feedback",
        url: "/feedback/fb1",
        metadata: expect.objectContaining({ feedbackId: "fb1" }),
      }),
    ]);
    // Delivered, so nothing is left waiting and nothing is counted as failed.
    expect(fakes.outbox.size).toBe(0);
    expect(eventsNamed("feedback_thread_failed")).toEqual([]);
  });

  it("sends an automatic error report as one plain line", async () => {
    await submitFeedback(
      {
        type: "bug",
        title: "[Auto] Could not load the sequence",
        description: "## Auto-generated Bug Report\n\n**Error Message:** ...",
      },
      "unknown",
      "unknown"
    );
    await settle();

    expect(fakes.sendMessage.mock.calls[0]![0].content).toBe(
      "Automatic error report: Could not load the sequence"
    );
  });

  it("records a failed send without the feedback text and keeps it for a retry", async () => {
    const failure = Object.assign(new Error("unavailable"), {
      code: "functions/unavailable",
    });
    fakes.sendMessage.mockRejectedValueOnce(failure);
    const words = "Private words that must not reach analytics.";

    const feedbackId = await submitFeedback(
      { type: "general", title: "", description: words },
      "browse",
      "gallery"
    );
    await settle();

    // The feedback item itself still saved and the submission succeeded.
    expect(feedbackId).toBe("fb1");
    expect(eventsNamed("feedback_thread_failed")).toEqual([
      {
        feedback_id: "fb1",
        stage: "send",
        error_code: "functions/unavailable",
        attempt: "submit",
      },
    ]);
    expect(JSON.stringify(fakes.logActivity.mock.calls)).not.toContain(words);
    const kept = fakes.outbox.get("feedback-fb1");
    expect(kept).toMatchObject({
      userId: "person-1",
      content: words,
      status: "queued",
      attemptCount: 1,
    });

    // Next app start: the same message, same id, goes through and is counted
    // as recovered.
    await retryUnsentFeedbackMessages("person-1");
    expect(fakes.sendMessage).toHaveBeenCalledTimes(2);
    expect(fakes.sendMessage.mock.calls[1]![0]).toMatchObject({
      messageId: "feedback-fb1",
      content: words,
    });
    expect(fakes.outbox.size).toBe(0);
    expect(eventsNamed("feedback_thread_recovered")).toEqual([
      { feedback_id: "fb1" },
    ]);
  });

  it("records a thread that could not be opened as its own stage", async () => {
    fakes.getOrCreateConversation.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "permission-denied" })
    );

    await submitFeedback(
      { type: "general", title: "", description: "Words for the thread." },
      "browse",
      "gallery"
    );
    await settle();

    expect(fakes.sendMessage).not.toHaveBeenCalled();
    expect(eventsNamed("feedback_thread_failed")).toEqual([
      expect.objectContaining({
        stage: "conversation",
        error_code: "permission-denied",
      }),
    ]);
    expect(fakes.outbox.has("feedback-fb1")).toBe(true);
  });

  it("retries only this account's feedback rows, never other outbox messages", async () => {
    const base = {
      conversationId: "c",
      content: "hi",
      createdAt: 1,
      updatedAt: 1,
      status: "failed" as const,
      attemptCount: 2,
    };
    fakes.outbox.set("feedback-old", {
      ...base,
      id: "feedback-old",
      userId: "person-1",
    });
    fakes.outbox.set("chat-uuid", {
      ...base,
      id: "chat-uuid",
      userId: "person-1",
    });
    fakes.outbox.set("feedback-other", {
      ...base,
      id: "feedback-other",
      userId: "someone-else",
    });

    await retryUnsentFeedbackMessages("person-1");

    expect(fakes.sendMessage).toHaveBeenCalledTimes(1);
    expect(fakes.sendMessage.mock.calls[0]![0].messageId).toBe("feedback-old");
    expect(fakes.outbox.has("chat-uuid")).toBe(true);
    expect(fakes.outbox.has("feedback-other")).toBe(true);
  });

  it("sends nothing when the admin submits feedback", async () => {
    fakes.user.current = { ...PERSON, uid: ADMIN_USER_ID };

    await submitFeedback(
      { type: "general", title: "", description: "A note to myself." },
      "browse",
      "gallery"
    );
    await settle();
    await retryUnsentFeedbackMessages(ADMIN_USER_ID);

    expect(fakes.getOrCreateConversation).not.toHaveBeenCalled();
    expect(fakes.sendMessage).not.toHaveBeenCalled();
    expect(fakes.repository.putOutbox).not.toHaveBeenCalled();
  });
});
