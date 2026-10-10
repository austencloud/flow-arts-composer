import { describe, it, expect, beforeEach } from "vitest";
import { inboxState } from "#lib/shared/inbox/state/inbox-state.svelte.js";
import { openSendAttachmentSheet } from "#lib/shared/inbox/state/send-sequence-state.svelte.js";
import type { SequenceSharePayload } from "#lib/shared/inbox/domain/models/sequence-share-payload.js";

function imageAttachment() {
  return {
    type: "image" as const,
    file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
    messageId: "m1",
    attachmentId: "a1",
  };
}

function sequencePayload(): SequenceSharePayload {
  return {
    sequence: { id: "s1", word: "ABC" } as SequenceSharePayload["sequence"],
    sequenceId: "s1",
    sequenceWord: "ABC",
  };
}

describe("inbox attachment share", () => {
  beforeEach(() => {
    inboxState.close();
  });

  it("opens the send-attachment view with an image attachment", () => {
    inboxState.openAttachmentShare(imageAttachment());

    expect(inboxState.isOpen).toBe(true);
    expect(inboxState.currentView).toBe("send-attachment");
    expect(inboxState.shareAttachment?.type).toBe("image");
  });

  it("carries a prefilled note through to the sheet", () => {
    inboxState.openAttachmentShare(imageAttachment(), { note: "look at this" });
    expect(inboxState.shareAttachmentNote).toBe("look at this");
  });

  it("keeps openSequenceShare working through the same view", () => {
    inboxState.openSequenceShare(sequencePayload());

    expect(inboxState.currentView).toBe("send-attachment");
    expect(inboxState.shareAttachment?.type).toBe("sequence");
  });

  it("routes openSendAttachmentSheet through the same state", () => {
    openSendAttachmentSheet(imageAttachment(), { note: "hi" });

    expect(inboxState.currentView).toBe("send-attachment");
    expect(inboxState.shareAttachmentNote).toBe("hi");
  });

  it("clears the attachment and the note when the share is cancelled", () => {
    inboxState.openAttachmentShare(imageAttachment(), { note: "hi" });
    inboxState.cancelAttachmentShare();

    expect(inboxState.shareAttachment).toBeNull();
    expect(inboxState.shareAttachmentNote).toBeNull();
  });

  it("carries the intake receiptId so the send can resolve the record", () => {
    // Trace 2.14. Without this the drawer has no way to know WHICH intake the
    // bytes it just sent belonged to, and the record can only be deleted at
    // picker-open time - which is exactly the data-loss bug this replaces.
    inboxState.openAttachmentShare(imageAttachment(), { receiptId: "si_abc" });
    expect(inboxState.shareAttachmentReceiptId).toBe("si_abc");
  });

  it("leaves the receiptId null for an ordinary in-app sequence share", () => {
    inboxState.openSequenceShare(sequencePayload());
    expect(inboxState.shareAttachmentReceiptId).toBeNull();
  });

  it("clears the receiptId on completion", () => {
    inboxState.openAttachmentShare(imageAttachment(), { receiptId: "si_abc" });
    inboxState.completeAttachmentShare("conversation-1");
    expect(inboxState.shareAttachmentReceiptId).toBeNull();
  });

  it("pre-selects a Direct Share destination without asking to navigate to it", () => {
    // The two fields mean different things and only one of them is safe here.
    // InboxDrawer.svelte:84-92 watches pendingConversationId and, 50ms later,
    // calls handleConversationSelect - which switches currentView to "thread"
    // and strands the attachment this call just staged. Writing BOTH fields
    // (the shipped 2026-07-29 behaviour) meant a successful Direct Share tap
    // dumped the user in the conversation with the photo gone.
    inboxState.openAttachmentShare(imageAttachment(), {
      conversationId: "conversation-1",
    });

    expect(inboxState.shareAttachmentConversationId).toBe("conversation-1");
    expect(inboxState.pendingConversationId).toBeNull();
    expect(inboxState.currentView).toBe("send-attachment");
  });
});
