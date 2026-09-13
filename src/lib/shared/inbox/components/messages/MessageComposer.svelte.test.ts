import { flushSync } from "svelte";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "$lib/shared/messaging/domain/models/message-models";
import { MemoryDeliveryRepository } from "$test-helpers/inbox/memory-delivery-repository";
import type { MessageDeliveryState } from "../../state/message-delivery-state.svelte";
import { createMessageDeliveryState } from "../../state/message-delivery-state.svelte";
import { inboxState } from "../../state/inbox-state.svelte";
import MessageComposer from "./MessageComposer.svelte";

const mocks = vi.hoisted(() => ({
  editMessage: vi.fn(),
  sendMessage: vi.fn(),
  setTyping: vi.fn(),
  toastError: vi.fn(),
  queueMessage: vi.fn(),
  saveDraft: vi.fn(),
  draftFor: vi.fn(),
  showUserError: vi.fn(),
  activeUserId: "user-a" as string | null,
  // Set by the account-ownership tests: `activeUserId` and `ready` are runes on
  // the real state, and only a real reactive write wakes the composer's
  // hydration effect. The other tests keep the cheap stub above.
  real: null as unknown,
}));

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

vi.mock("$lib/shared/messaging/services/messenger", () => ({
  messagingService: {
    editMessage: mocks.editMessage,
    sendMessage: mocks.sendMessage,
    setTyping: mocks.setTyping,
  },
}));

vi.mock("../../context/message-delivery-context", () => {
  type Delivery = {
    ready: boolean;
    activeUserId: string | null;
    draftFor: (conversationId: string) => unknown;
    saveDraft: (...args: unknown[]) => Promise<void>;
    queueMessage: (...args: unknown[]) => Promise<string>;
  };
  const stub: Delivery = {
    get ready() {
      return true;
    },
    get activeUserId() {
      return mocks.activeUserId;
    },
    draftFor: (conversationId: string) => mocks.draftFor(conversationId),
    saveDraft: (...args: unknown[]) => mocks.saveDraft(...args),
    queueMessage: (...args: unknown[]) => mocks.queueMessage(...args),
  };
  const delivery: Delivery = {
    get ready() {
      return ((mocks.real as Delivery | null) ?? stub).ready;
    },
    get activeUserId() {
      return ((mocks.real as Delivery | null) ?? stub).activeUserId;
    },
    draftFor: (conversationId) =>
      ((mocks.real as Delivery | null) ?? stub).draftFor(conversationId),
    saveDraft: (...args) =>
      ((mocks.real as Delivery | null) ?? stub).saveDraft(
        ...(args as [string, never])
      ),
    queueMessage: (...args) =>
      ((mocks.real as Delivery | null) ?? stub).queueMessage(
        ...(args as [never])
      ),
  };
  return { getMessageDeliveryContext: () => delivery };
});

vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: () => ({ showUserError: mocks.showUserError }),
}));

vi.mock("$lib/shared/messaging/get-message-image-sender", () => ({
  getMessageImageSender: () => ({
    send: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  }),
}));

vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: () => ({}),
}));

vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: () => ({ createShortCode: vi.fn() }),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toastQueue: [],
  showToast: vi.fn(),
  removeToast: vi.fn(),
  clearToasts: vi.fn(),
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: mocks.toastError,
  },
}));

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "current-user",
    senderName: "Austen",
    content: "Original message",
    createdAt: new Date("2026-07-31T12:00:00Z"),
    readBy: ["current-user"],
    ...overrides,
  };
}

function dispatchKey(key: string): void {
  const input = document.querySelector("textarea");
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error("Message textarea was not rendered");
  }
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
  flushSync();
}

/** Real delivery states built by the account-ownership tests, disposed after. */
const realStates: MessageDeliveryState[] = [];

afterEach(() => {
  realStates.splice(0).forEach((state) => state.dispose());
});

describe("MessageComposer editing", () => {
  beforeEach(() => {
    inboxState.clearEditingMessage();
    inboxState.clearReplyTo();
    inboxState.setMessages([]);
    mocks.editMessage.mockReset();
    mocks.editMessage.mockResolvedValue(message({ content: "Corrected" }));
    mocks.sendMessage.mockReset();
    mocks.setTyping.mockReset();
    mocks.setTyping.mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.queueMessage.mockReset();
    mocks.queueMessage.mockResolvedValue("outbox-message");
    mocks.saveDraft.mockReset();
    mocks.saveDraft.mockResolvedValue(undefined);
    mocks.draftFor.mockReset();
    mocks.draftFor.mockReturnValue(undefined);
    mocks.showUserError.mockReset();
    mocks.activeUserId = "user-a";
    mocks.real = null;
  });

  it("enables native spelling suggestions in the message field", async () => {
    render(MessageComposer, { conversationId: "conversation-1" });
    const composer = page.getByRole("textbox", { name: "Message input" });

    await expect.element(composer).toHaveAttribute("spellcheck", "true");
    expect((composer.element() as HTMLTextAreaElement).spellcheck).toBe(true);
  });

  it("shows a scrollbar only after the message exceeds its maximum height", async () => {
    render(MessageComposer, { conversationId: "conversation-1" });
    const composer = page.getByRole("textbox", { name: "Message input" });
    const input = composer.element() as HTMLTextAreaElement;

    await composer.fill("A short message");
    expect(getComputedStyle(input).overflowY).toBe("hidden");
    expect(input.scrollHeight).toBeLessThanOrEqual(input.clientHeight);

    await composer.fill(
      Array.from({ length: 20 }, (_, index) => `Line ${index}`).join("\n")
    );
    expect(input.style.height).toBe("120px");
    expect(getComputedStyle(input).overflowY).toBe("auto");
    expect(input.scrollHeight).toBeGreaterThan(input.clientHeight);
  });

  it("resizes wrapped text when the composer becomes narrower", async () => {
    render(MessageComposer, { conversationId: "conversation-1" });
    const composer = page.getByRole("textbox", { name: "Message input" });
    const input = composer.element() as HTMLTextAreaElement;

    input.style.width = "600px";
    await composer.fill("Hey! I'm excited to see you guys trying out the app!");
    const wideHeight = input.offsetHeight;
    input.style.width = "180px";
    window.dispatchEvent(new Event("resize"));

    await vi.waitFor(() => {
      expect(input.offsetHeight).toBeGreaterThan(wideHeight);
      expect(input.scrollHeight).toBeLessThanOrEqual(input.clientHeight);
    });
  });

  it("restores an unsent draft after saving an edit", async () => {
    render(MessageComposer, { conversationId: "conversation-1" });
    const composer = page.getByRole("textbox", { name: "Message input" });
    await composer.fill("Keep this draft");

    inboxState.setEditingMessage(message());
    flushSync();

    const editor = page.getByRole("textbox", { name: "Edit message" });
    await expect.element(editor).toHaveValue("Original message");
    await expect
      .element(page.getByRole("button", { name: "Save changes" }))
      .toBeDisabled();

    await editor.fill("  Corrected message  ");
    await page.getByRole("button", { name: "Save changes" }).click();

    await vi.waitFor(() => {
      expect(mocks.editMessage).toHaveBeenCalledWith(
        "conversation-1",
        "message-1",
        "Corrected message"
      );
    });
    await expect
      .element(page.getByRole("textbox", { name: "Message input" }))
      .toHaveValue("Keep this draft");
  });

  it("restores a durable conversation draft on mount", async () => {
    mocks.draftFor.mockReturnValue({
      id: "current-user:conversation-1",
      userId: "current-user",
      conversationId: "conversation-1",
      content: "Survived the reload",
      updatedAt: Date.now(),
    });

    render(MessageComposer, { conversationId: "conversation-1" });

    await expect
      .element(page.getByRole("textbox", { name: "Message input" }))
      .toHaveValue("Survived the reload");
  });

  it("autosaves an unfinished message for its conversation", async () => {
    render(MessageComposer, { conversationId: "conversation-1" });
    await page
      .getByRole("textbox", { name: "Message input" })
      .fill("Keep this after closing");

    await vi.waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith("conversation-1", {
        content: "Keep this after closing",
        replyTo: undefined,
        attachment: undefined,
      });
    });
  });

  it("saves an in-flight draft to the conversation it was typed in", async () => {
    const screen = render(MessageComposer, {
      conversationId: "conversation-1",
    });
    await page
      .getByRole("textbox", { name: "Message input" })
      .fill("Meant for the first thread");

    // Switching threads inside the autosave debounce window is ordinary use:
    // tap back, tap another conversation. The pending save must still land on
    // the thread the text was typed in — writing it to the newly opened thread
    // both destroys that thread's own draft and stages the text for the wrong
    // recipient.
    await screen.rerender({ conversationId: "conversation-2" });

    await vi.waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith("conversation-1", {
        content: "Meant for the first thread",
        replyTo: undefined,
        attachment: undefined,
      });
    });
    expect(mocks.saveDraft).not.toHaveBeenCalledWith(
      "conversation-2",
      expect.objectContaining({ content: "Meant for the first thread" })
    );
  });

  it("never writes a pending draft into another account's ledger", async () => {
    const repository = new MemoryDeliveryRepository();
    repository.drafts.set("user-b:conversation-1", {
      id: "user-b:conversation-1",
      userId: "user-b",
      conversationId: "conversation-1",
      content: "Second account's own draft",
      updatedAt: 1,
    });
    const state = createMessageDeliveryState({
      repository,
      coordinator: { deliver: async () => undefined },
      isOnline: () => true,
    });
    realStates.push(state);
    await state.activate("user-a");
    mocks.real = state;

    render(MessageComposer, { conversationId: "conversation-1" });
    await page
      .getByRole("textbox", { name: "Message input" })
      .fill("Typed while the first account was signed in");

    // The account changes inside the autosave window. A draft id is
    // `<userId>:<conversationId>`, so writing this text now would file it under
    // the second account — and the composer must re-read from that account's
    // ledger even though the conversation did not change.
    await state.activate("user-b");
    flushSync();

    await expect
      .element(page.getByRole("textbox", { name: "Message input" }))
      .toHaveValue("Second account's own draft");

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(
      [...repository.drafts.values()].map((draft) => draft.content)
    ).toEqual(["Second account's own draft"]);
  });

  it("keeps a failed save for a closed thread out of the open thread", async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    const screen = render(MessageComposer, {
      conversationId: "conversation-1",
    });
    await page
      .getByRole("textbox", { name: "Message input" })
      .fill("First thread text");
    await screen.rerender({ conversationId: "conversation-2" });

    await vi.waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        "conversation-1",
        expect.objectContaining({ content: "First thread text" })
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The warning and the error report belong to the thread that failed, which
    // is no longer on screen.
    expect(document.body.textContent).not.toContain("Draft not saved");
    expect(mocks.showUserError).not.toHaveBeenCalled();
  });

  it("opens the latest editable message with Arrow Up and cancels with Escape", async () => {
    const latest = message();
    render(MessageComposer, {
      conversationId: "conversation-1",
      lastEditableMessage: latest,
    });

    dispatchKey("ArrowUp");
    await expect
      .element(page.getByRole("textbox", { name: "Edit message" }))
      .toHaveValue("Original message");

    dispatchKey("Escape");
    await expect
      .element(page.getByRole("textbox", { name: "Message input" }))
      .toHaveValue("");
    expect(mocks.editMessage).not.toHaveBeenCalled();
  });

  it("lets an attachment caption be cleared", async () => {
    inboxState.setEditingMessage(
      message({
        content: "Photo caption",
        attachments: [{ type: "image", storagePath: "message-images/x.webp" }],
      })
    );
    render(MessageComposer, { conversationId: "conversation-1" });

    const editor = page.getByRole("textbox", { name: "Edit message" });
    await expect.element(editor).toHaveValue("Photo caption");
    await editor.fill("");

    const save = page.getByRole("button", { name: "Save changes" });
    await expect.element(save).toBeEnabled();
    await save.click();

    await vi.waitFor(() => {
      expect(mocks.editMessage).toHaveBeenCalledWith(
        "conversation-1",
        "message-1",
        ""
      );
    });
  });

  it("keeps the edited text in place when saving fails", async () => {
    mocks.editMessage.mockRejectedValueOnce(new Error("offline"));
    inboxState.setEditingMessage(message());
    render(MessageComposer, { conversationId: "conversation-1" });

    const editor = page.getByRole("textbox", { name: "Edit message" });
    await editor.fill("Keep this correction");
    await page.getByRole("button", { name: "Save changes" }).click();

    await vi.waitFor(() => {
      expect(mocks.showUserError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "These changes could not be saved.",
          context: expect.objectContaining({ action: "editMessage" }),
        })
      );
    });
    await expect.element(editor).toHaveValue("Keep this correction");
    await expect
      .element(page.getByRole("button", { name: "Save changes" }))
      .toBeEnabled();
  });

  it("keeps typing keystrokes away from background app hotkeys", () => {
    const backgroundHotkey = vi.fn((event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s") event.preventDefault();
    });
    window.addEventListener("keydown", backgroundHotkey);

    try {
      render(MessageComposer, { conversationId: "conversation-1" });
      const input = document.querySelector("textarea");
      if (!(input instanceof HTMLTextAreaElement)) {
        throw new Error("Message textarea was not rendered");
      }

      const event = new KeyboardEvent("keydown", {
        key: "s",
        code: "KeyS",
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(backgroundHotkey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", backgroundHotkey);
    }
  });

  it("focuses the existing draft and sends a complete reply snapshot", async () => {
    const originalText = "A".repeat(240);
    inboxState.setReplyTo(
      message({
        id: "original-message",
        senderId: "other-user",
        senderName: "Morgan",
        content: originalText,
        attachments: [{ type: "sequence" }],
      })
    );
    render(MessageComposer, { conversationId: "conversation-1" });

    const composer = page.getByRole("textbox", { name: "Message input" });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector("textarea"));
    });
    await expect.element(page.getByText("Replying to Morgan")).toBeVisible();
    await composer.fill("This is the answer");
    await page.getByRole("button", { name: "Send message" }).click();

    await vi.waitFor(() => {
      expect(mocks.queueMessage).toHaveBeenCalledWith({
        conversationId: "conversation-1",
        content: "This is the answer",
        attachment: undefined,
        replyTo: {
          messageId: "original-message",
          senderId: "other-user",
          senderName: "Morgan",
          content: originalText,
          attachmentType: "sequence",
        },
      });
    });
    expect(inboxState.replyToMessage).toBeNull();
  });

  it("cancels a reply with Escape without clearing the draft", async () => {
    inboxState.setReplyTo(
      message({
        id: "original-message",
        senderId: "other-user",
        senderName: "Morgan",
      })
    );
    render(MessageComposer, { conversationId: "conversation-1" });
    const composer = page.getByRole("textbox", { name: "Message input" });
    await composer.fill("Keep this draft");

    dispatchKey("Escape");

    expect(inboxState.replyToMessage).toBeNull();
    await expect.element(composer).toHaveValue("Keep this draft");
    expect(mocks.queueMessage).not.toHaveBeenCalled();
  });
});
