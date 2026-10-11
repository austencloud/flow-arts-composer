import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { buildSequenceSharePayload } from "../../domain/build-sequence-share-payload";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SendAttachmentSheet from "./SendAttachmentSheet.svelte";
import { inboxState } from "../../state/inbox-state.svelte";

const mocks = vi.hoisted(() => ({
  conversations: [] as Array<Record<string, unknown>>,
  inbox: { shareAttachmentConversationId: null as string | null },
  createShortCode: vi.fn(),
  ensureGuestIdentity: vi.fn(),
  getOrCreateConversation: vi.fn(),
  searchUsers: vi.fn(),
  queueMessage: vi.fn(),
  showUserError: vi.fn(),
  authDrawerShow: vi.fn(),
  cancelSequenceShare: vi.fn(),
  fullAccount: true,
}));

vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: mocks.showUserError }),
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

vi.mock("#lib/shared/auth/services/guest-identity.js", () => ({
  ensureGuestIdentity: mocks.ensureGuestIdentity,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    user: { uid: "current-user" },
    get isFullAccount() {
      return mocks.fullAccount;
    },
  },
}));

vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { show: mocks.authDrawerShow },
}));

vi.mock("#lib/shared/messaging/services/conversation-manager.js", () => ({
  conversationService: {
    getOrCreateConversation: mocks.getOrCreateConversation,
  },
}));

vi.mock("../../context/message-delivery-context", () => ({
  getMessageDeliveryContext: () => ({ queueMessage: mocks.queueMessage }),
}));

vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => ({
    createShortCode: mocks.createShortCode,
  }),
}));

vi.mock("#lib/shared/user-search/services/user-searcher.js", () => ({
  searchUsers: mocks.searchUsers,
}));

vi.mock("../../state/inbox-state.svelte", () => ({
  inboxState: {
    conversations: mocks.conversations,
    get shareAttachmentConversationId() {
      return mocks.inbox.shareAttachmentConversationId;
    },
    clearPendingNavigation() {
      mocks.inbox.shareAttachmentConversationId = null;
    },
    cancelSequenceShare: mocks.cancelSequenceShare,
    // Mirrors the one field of openAttachmentShare this sheet consumes; the
    // real state module's own contract is covered by its unit tests.
    openAttachmentShare(
      _attachment: unknown,
      options: { conversationId?: string } = {}
    ) {
      mocks.inbox.shareAttachmentConversationId =
        options.conversationId ?? null;
    },
  },
}));

function createPayload() {
  return buildSequenceSharePayload(
    createSequenceData({
      id: "sequence-1",
      name: "Practice pair",
      word: "ABABABAB",
    })
  );
}

function addGroupConversation(): void {
  mocks.conversations.push({
    id: "group-1",
    type: "group",
    groupName: "Tuesday Jam",
    participantCount: 4,
    participantPreviews: [],
    unreadCount: 0,
    updatedAt: new Date("2026-07-27T12:00:00Z"),
  });
}

function addDirectConversation(): void {
  mocks.conversations.push({
    id: "conv_paul",
    type: "direct",
    otherParticipant: {
      userId: "paul",
      displayName: "Paul",
      joinedAt: new Date("2026-07-01T12:00:00Z"),
    },
    unreadCount: 0,
    updatedAt: new Date("2026-07-28T12:00:00Z"),
  });
}

/**
 * The sheet's layout is driven by a CONTAINER query on its own width, not by
 * the viewport, and the two layouts behave differently on purpose: narrow hides
 * the destination list once you pick someone, wide keeps it on screen so you
 * can pick more. The browser runner's viewport is wide, so a test that does not
 * say which layout it means is silently testing only the wide one.
 */
function setSheetWidth(px: number): void {
  // Sized directly rather than via the body: the runner mounts the component
  // into its own wrapper, so constraining the body does not reliably reach the
  // element that carries `container-type: inline-size`.
  let style = document.getElementById("sheet-width-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "sheet-width-style";
    document.head.appendChild(style);
  }
  // .sheet-shell, not .send-attachment-sheet: the shell is what carries
  // `container-type`, and sizing the inner element would leave the container
  // itself full-width and every container query resolving against that.
  style.textContent = `.sheet-shell { width: ${px}px !important; }`;
}

// Deliberately clear of the 42rem seam in BOTH directions. 420px was the first
// choice and it is exactly 42rem whenever the root font size is 10px, so the
// query matched and the "narrow" cases were quietly running the wide layout.
const NARROW = 340; // Phone / 1920-desktop drawer: single column.
const WIDE = 900; // Fold unfolded / 2560+ drawer: two columns.

describe("SendAttachmentSheet", () => {
  beforeEach(() => {
    setSheetWidth(NARROW);
    mocks.conversations.length = 0;
    mocks.inbox.shareAttachmentConversationId = null;
    mocks.createShortCode.mockReset();
    mocks.createShortCode.mockResolvedValue({ code: "SHARE1" });
    mocks.ensureGuestIdentity.mockReset();
    mocks.ensureGuestIdentity.mockResolvedValue(undefined);
    mocks.getOrCreateConversation.mockReset();
    mocks.searchUsers.mockReset();
    mocks.queueMessage.mockReset();
    mocks.queueMessage.mockResolvedValue("message-1");
    mocks.showUserError.mockReset();
    mocks.authDrawerShow.mockReset();
    mocks.cancelSequenceShare.mockReset();
    mocks.fullAccount = true;
  });

  it("renders and owns a transient Choreo Card preview", async () => {
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const payload = {
      ...createPayload(),
      sequencePreviewBlob: new Blob(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>',
        ],
        { type: "image/svg+xml" }
      ),
    };
    const screen = render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload },
      onSent: vi.fn(),
    });
    let previewUrl = "";

    await vi.waitFor(() => {
      const preview =
        document.querySelector<HTMLImageElement>(".thumbnail-img");
      expect(preview?.src).toMatch(/^blob:/);
      previewUrl = preview?.src ?? "";
    });

    screen.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith(previewUrl);
    revokeObjectUrl.mockRestore();
  });

  it("stops a guest send if account state changes while the sheet is open", async () => {
    addGroupConversation();
    mocks.fullAccount = false;
    render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload: createPayload() },
      onSent: vi.fn(),
    });

    await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
    await page.getByRole("button", { name: "Send sequence" }).click();

    expect(mocks.cancelSequenceShare).toHaveBeenCalledOnce();
    expect(mocks.authDrawerShow).toHaveBeenCalledWith(
      "signup",
      "share-sequence"
    );
    expect(mocks.ensureGuestIdentity).not.toHaveBeenCalled();
    expect(mocks.createShortCode).not.toHaveBeenCalled();
    expect(mocks.queueMessage).not.toHaveBeenCalled();
  });

  it("sends an attachment-only message to an existing group", async () => {
    addGroupConversation();
    const onSent = vi.fn();

    render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload: createPayload() },
      onSent,
    });

    await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();

    // Narrow layout: choosing collapses the browser. The node stays in the DOM
    // now (the wide layout keeps it on screen) but display:none takes it out of
    // the accessibility tree, so a role query stops finding it - which is the
    // behaviour that actually matters here.
    await expect
      .element(page.getByRole("combobox", { name: "Search users" }))
      .not.toBeInTheDocument();
    await page.getByRole("button", { name: "Change" }).click();
    await expect
      .element(page.getByRole("combobox", { name: "Search users" }))
      .toBeInTheDocument();
    await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
    await page.getByRole("button", { name: "Send sequence" }).click();

    await vi.waitFor(() => {
      expect(mocks.queueMessage).toHaveBeenCalledOnce();
    });

    expect(mocks.getOrCreateConversation).not.toHaveBeenCalled();
    expect(mocks.createShortCode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sequence-1" }),
      { embedSequenceData: true }
    );
    expect(mocks.queueMessage).toHaveBeenCalledWith({
      conversationId: "group-1",
      content: "",
      attachment: expect.objectContaining({
        type: "sequence",
        payload: expect.objectContaining({ sequenceId: "sequence-1" }),
      }),
      preparedAttachments: [
        expect.objectContaining({
          type: "sequence",
          url: "/q/SHARE1",
          name: "AB",
        }),
      ],
    });
    expect(onSent).toHaveBeenCalledWith(["group-1"]);
  });

  it("starts a direct conversation for a searched person and sends the note", async () => {
    mocks.searchUsers.mockResolvedValue([
      {
        uid: "new-user",
        displayName: "Alex Rivera",
        username: "alex",
      },
    ]);
    mocks.getOrCreateConversation.mockResolvedValue({
      conversation: { id: "direct-1" },
      isNew: true,
    });
    const onSent = vi.fn();

    render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload: createPayload() },
      onSent,
    });

    const search = page.getByRole("combobox", { name: "Search users" });
    await search.fill("alex");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.getByRole("option", { name: /Alex Rivera/ }).click();
    await page.getByRole("textbox", { name: /Note/ }).fill("  Try this one  ");
    await page.getByRole("button", { name: "Send sequence" }).click();

    await vi.waitFor(() => {
      expect(mocks.queueMessage).toHaveBeenCalledOnce();
    });

    expect(mocks.getOrCreateConversation).toHaveBeenCalledWith("new-user", {
      silent: true,
    });
    expect(mocks.queueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "direct-1",
        content: "Try this one",
      })
    );
    expect(onSent).toHaveBeenCalledWith(["direct-1"]);
  });

  it("surfaces a send failure and restores the send action", async () => {
    addGroupConversation();
    mocks.queueMessage.mockRejectedValue(new Error("permission denied"));

    render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload: createPayload() },
      onSent: vi.fn(),
    });

    await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
    await page.getByRole("button", { name: "Send sequence" }).click();

    await vi.waitFor(() => {
      expect(mocks.showUserError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "The sequence couldn’t be saved to the outbox. Try again.",
          technicalDetails: "permission denied",
        })
      );
    });

    await expect
      .element(page.getByRole("button", { name: "Send sequence" }))
      .toBeEnabled();
  });

  it("queues an image attachment with fresh IDs for its recipient", async () => {
    addGroupConversation();
    const onSent = vi.fn();

    render(SendAttachmentSheet, {
      attachment: {
        type: "image",
        file: new File([new Uint8Array([1, 2, 3])], "shared.png", {
          type: "image/png",
        }),
        messageId: "msg-1",
        attachmentId: "att-1",
      },
      initialNote: "from the share sheet",
      onSent,
    });

    await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
    await page.getByRole("button", { name: "Send image" }).click();

    await vi.waitFor(() => {
      expect(mocks.queueMessage).toHaveBeenCalledOnce();
    });

    expect(mocks.queueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "group-1",
        content: "from the share sheet",
        attachment: expect.objectContaining({
          type: "image",
          messageId: expect.any(String),
          attachmentId: expect.any(String),
        }),
      })
    );
    const queuedImage = mocks.queueMessage.mock.calls[0]?.[0]?.attachment;
    expect(queuedImage.messageId).not.toBe("msg-1");
    expect(queuedImage.attachmentId).not.toBe("att-1");
    expect(onSent).toHaveBeenCalledWith(["group-1"]);
  });

  it("opens with the direct-share conversation already selected", async () => {
    addDirectConversation();
    inboxState.openAttachmentShare(
      {
        type: "image",
        file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
        messageId: "m1",
        attachmentId: "a1",
      },
      { conversationId: "conv_paul", receiptId: "si_1" }
    );

    render(SendAttachmentSheet, {
      attachment: {
        type: "image",
        file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
        messageId: "m1",
        attachmentId: "a1",
      },
      onSent: vi.fn(),
    });

    // The whole point of a Direct Share tap: the next tap is Send, not a pick.
    await expect
      .element(page.getByRole("button", { name: "Send image" }))
      .toBeEnabled();
    // Pre-selected, not merely enabled: Paul is named in the destination slot
    // and (narrow layout) the picker has collapsed.
    await expect
      .element(page.getByRole("button", { name: "Change" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("combobox", { name: "Search users" }))
      .not.toBeInTheDocument();
  });

  it("leaves the sheet unselected when the shortcut names a stale conversation", async () => {
    addDirectConversation();
    inboxState.openAttachmentShare(
      { type: "sequence", payload: createPayload() },
      { conversationId: "conv_deleted" }
    );

    render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload: createPayload() },
      onSent: vi.fn(),
    });

    await expect
      .element(page.getByRole("button", { name: "Send sequence" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("combobox", { name: "Search users" }))
      .toBeInTheDocument();
  });

  describe("multiple recipients", () => {
    it("sends one share to every selected conversation", async () => {
      setSheetWidth(WIDE);
      addGroupConversation();
      addDirectConversation();
      const onSent = vi.fn();

      render(SendAttachmentSheet, {
        attachment: { type: "sequence", payload: createPayload() },
        onSent,
      });

      await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
      await page.getByRole("button", { name: /Send to Paul/ }).click();

      // The count IS the confirmation that both took.
      await page.getByRole("button", { name: "Send sequence to 2" }).click();

      await vi.waitFor(() => {
        expect(mocks.queueMessage).toHaveBeenCalledTimes(2);
      });

      // One short code for the whole share, not one per recipient.
      expect(mocks.createShortCode).toHaveBeenCalledOnce();
      expect(mocks.queueMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ conversationId: "group-1" })
      );
      expect(mocks.queueMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ conversationId: "conv_paul" })
      );
      expect(onSent).toHaveBeenCalledWith(["group-1", "conv_paul"]);
    });

    it("takes a recipient back off the list when tapped again", async () => {
      setSheetWidth(WIDE);
      addGroupConversation();
      addDirectConversation();

      render(SendAttachmentSheet, {
        attachment: { type: "sequence", payload: createPayload() },
        onSent: vi.fn(),
      });

      await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
      await page.getByRole("button", { name: /Send to Paul/ }).click();
      await expect
        .element(page.getByRole("button", { name: "Send sequence to 2" }))
        .toBeVisible();

      await page.getByRole("button", { name: /Send to Paul/ }).click();

      // Back to one: the label drops the count rather than saying "to 1".
      await expect
        .element(page.getByRole("button", { name: "Send sequence" }))
        .toBeVisible();
    });

    it("removes a single recipient from its chip", async () => {
      setSheetWidth(WIDE);
      addGroupConversation();
      addDirectConversation();

      render(SendAttachmentSheet, {
        attachment: { type: "sequence", payload: createPayload() },
        onSent: vi.fn(),
      });

      await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
      await page.getByRole("button", { name: /Send to Paul/ }).click();
      await page.getByRole("button", { name: "Remove Paul" }).click();

      await expect
        .element(page.getByRole("button", { name: "Send sequence" }))
        .toBeVisible();
    });

    it("keeps the recipients that succeeded when one of them fails", async () => {
      setSheetWidth(WIDE);
      addGroupConversation();
      addDirectConversation();
      const onSent = vi.fn();
      // Second delivery only. A partial failure must not discard the share for
      // the people who DID receive it, and must not silently swallow the miss.
      mocks.queueMessage
        .mockResolvedValueOnce("message-1")
        .mockRejectedValueOnce(new Error("permission denied"));

      render(SendAttachmentSheet, {
        attachment: { type: "sequence", payload: createPayload() },
        onSent,
      });

      await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
      await page.getByRole("button", { name: /Send to Paul/ }).click();
      await page.getByRole("button", { name: "Send sequence to 2" }).click();

      await vi.waitFor(() => {
        expect(onSent).toHaveBeenCalledWith(["group-1"]);
      });
      // Not the whole-send error path: that would tell the user nothing went
      // out when half of it did.
      expect(mocks.showUserError).not.toHaveBeenCalled();
    });

    it("reports a whole-send failure when no recipient receives it", async () => {
      setSheetWidth(WIDE);
      addGroupConversation();
      addDirectConversation();
      const onSent = vi.fn();
      mocks.queueMessage.mockRejectedValue(new Error("permission denied"));

      render(SendAttachmentSheet, {
        attachment: { type: "sequence", payload: createPayload() },
        onSent,
      });

      await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
      await page.getByRole("button", { name: /Send to Paul/ }).click();
      await page.getByRole("button", { name: "Send sequence to 2" }).click();

      await vi.waitFor(() => {
        expect(mocks.showUserError).toHaveBeenCalled();
      });
      expect(onSent).not.toHaveBeenCalled();
      // The sheet stays usable so the share is not lost.
      await expect
        .element(page.getByRole("button", { name: "Send sequence to 2" }))
        .toBeEnabled();
    });
  });
});
