import { describe, expect, it, vi } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { buildSequenceSharePayload } from "#lib/shared/inbox/domain/build-sequence-share-payload.js";
import { createSendAttachmentStateForTest } from "./send-attachment-test-helper.svelte";

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { isFullAccount: true, user: { uid: "sender" } },
}));
vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { show: vi.fn() },
}));
vi.mock("#lib/shared/auth/services/guest-identity.js", () => ({
  ensureGuestIdentity: vi.fn(() => Promise.resolve()),
}));
vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => ({
    createShortCode: vi.fn(() => Promise.resolve({ code: "AB3D" })),
  }),
}));
vi.mock("#lib/shared/messaging/services/conversation-manager.js", () => ({
  conversationService: {
    getOrCreateConversation: vi.fn(() =>
      Promise.resolve({ conversation: { id: "conversation-1" } })
    ),
  },
}));
vi.mock("#lib/shared/inbox/state/inbox-state.svelte.js", () => ({
  inboxState: { conversations: [] },
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
}));

describe("sending a sequence from the viewer's share panel", () => {
  it("carries the view on stage when Send is pressed", async () => {
    const sequence = createSequenceData({
      id: "view-at-send",
      name: "View at send",
      word: "AB",
    });
    let viewParams: string | undefined = "pane=card";
    const queueMessage = vi.fn(() => Promise.resolve());
    const onSent = vi.fn();

    const { state, dispose } = createSendAttachmentStateForTest(
      {
        getAttachment: () => ({
          type: "sequence",
          payload: buildSequenceSharePayload(sequence),
        }),
        onSent,
        onGuestBlocked: () => undefined,
        getSequenceViewParams: () => viewParams,
      },
      { delivery: { queueMessage }, getHaptics: () => undefined }
    );

    state.selectUser({ uid: "friend", displayName: "Friend" });
    // The person switches views with the panel still open, then sends.
    viewParams = "pane=animation&fx=trail";
    await state.send();

    expect(onSent).toHaveBeenCalledWith(["conversation-1"]);
    const [queued] = queueMessage.mock.calls[0] as unknown as [
      {
        attachment: { payload: { sequenceViewParams?: string } };
        preparedAttachments: Array<{ url: string }>;
      },
    ];
    expect(queued.attachment.payload.sequenceViewParams).toBe(
      "pane=animation&fx=trail"
    );
    expect(queued.preparedAttachments[0]!.url).toBe(
      "/q/AB3D?pane=animation&fx=trail"
    );
    dispose();
  });
});
