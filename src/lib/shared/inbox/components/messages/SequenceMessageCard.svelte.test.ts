import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MessageAttachment } from "#lib/shared/messaging/domain/models/message-models.js";

const mocks = vi.hoisted(() => ({
  closeInbox: vi.fn(),
  hydrateSequence: vi.fn(),
  openSequenceViewer: vi.fn(),
  resolveShortCode: vi.fn(),
  haptic: vi.fn(),
  showUserError: vi.fn(),
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: mocks.haptic }),
}));

vi.mock("../../state/inbox-state.svelte", () => ({
  inboxState: { close: mocks.closeInbox },
}));

vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => ({
    resolveShortCode: mocks.resolveShortCode,
  }),
}));

vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: mocks.showUserError }),
}));

vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-data-provider.js",
  () => ({
    hydrateSequence: mocks.hydrateSequence,
  })
);

vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js",
  () => ({ openSequenceViewer: mocks.openSequenceViewer })
);

vi.mock("./SequenceMessagePreview.svelte", async () => ({
  default: (
    await import("#lib/shared/sequence-viewer/components/__test-stubs__/SequenceViewerDrawerHostChildStub.svelte")
  ).default,
}));

import SequenceMessageCard from "./SequenceMessageCard.svelte";

describe("SequenceMessageCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a message sequence in the in-app viewer drawer", async () => {
    const resolved = createSequenceData({
      id: "shared-sequence",
      word: "ABCD",
    });
    const hydrated = {
      ...resolved,
      metadata: { _hydratedAt: Date.now() },
    } as SequenceData;
    const attachment: MessageAttachment = {
      type: "sequence",
      url: "/q/SHARED42",
      name: "ABCD",
      metadata: {
        sequenceId: resolved.id,
        sequenceShortCode: "SHARED42",
        sequenceWord: resolved.word,
      },
    };
    mocks.resolveShortCode.mockResolvedValue(resolved);
    mocks.hydrateSequence.mockResolvedValue(hydrated);

    render(SequenceMessageCard, { attachment, isOwn: true });
    await page.getByRole("button", { name: "Open in Sequence Viewer" }).click();

    await vi.waitFor(() => {
      expect(mocks.openSequenceViewer).toHaveBeenCalledWith(hydrated, {
        returnPath: window.location.pathname,
        returnLabel: "Messages",
      });
    });
    expect(mocks.resolveShortCode).toHaveBeenCalledWith("SHARED42");
    expect(mocks.hydrateSequence).toHaveBeenCalledWith(resolved);
    expect(mocks.closeInbox).toHaveBeenCalledOnce();
    expect(mocks.closeInbox.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openSequenceViewer.mock.invocationCallOrder[0] ?? Infinity
    );
    expect(window.location.pathname).not.toMatch(/^\/q\//);
    expect(mocks.showUserError).not.toHaveBeenCalled();
  });
});
