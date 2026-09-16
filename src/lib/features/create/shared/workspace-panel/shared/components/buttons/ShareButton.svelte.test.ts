import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import ShareButton from "./ShareButton.svelte";

const shareButtonMocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  openSendSequenceSheet: vi.fn(),
  authDrawerShow: vi.fn(),
  fullAccount: true,
  getCardImageBlob: vi.fn(),
  buildSequenceSharePayload: vi.fn(
    (sequence: { id: string; word?: string }) => ({
      sequence,
      sequenceId: sequence.id,
      sequenceWord: sequence.word ?? "",
    })
  ),
  createShortCode: vi.fn().mockResolvedValue({
    url: "https://tka.run/COPY",
  }),
}));

vi.mock("$lib/shared/mobile/share-action.svelte", () => ({
  shareTarget: {
    get isMobile() {
      return false;
    },
  },
}));

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => null,
}));

vi.mock("$lib/shared/share/get-sharer", () => ({
  getSharer: () => ({
    getCardImageBlob: shareButtonMocks.getCardImageBlob,
    generateFilename: vi.fn(() => "sequence.png"),
  }),
}));

vi.mock("$lib/shared/share/state/image-composition-state.svelte", () => ({
  getImageCompositionManager: () => ({
    darkMode: true,
    showNotes: false,
    customNotesText: "Created using Flow Arts Composer",
    includeStartPlacement: true,
    addStepNumbers: true,
    addWord: true,
    addDifficultyLevel: true,
    showLoopGlyph: true,
    showQRCode: false,
    showMandala: false,
    getColumnCountForStepCount: () => 4,
    getStartPlacementLayoutForStepCount: () => "row",
    getInfoCellChoiceForStepCount: () => "none",
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  }),
}));

vi.mock("$lib/shared/render/get-glyph-cache", () => ({
  getGlyphCache: () => ({
    getGlyphDataUrl: () => null,
    loadGlyphsByLetter: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("$lib/shared/pictograph/shared/state/visibility-state.svelte", () => ({
  getVisibilityStateManager: () => ({
    getGridVisibility: () => true,
    getState: () => ({}),
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  }),
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get isFullAccount() {
      return shareButtonMocks.fullAccount;
    },
    user: { displayName: "Austen" },
  },
  getUser: () => null,
}));

vi.mock("$lib/shared/auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: {
    show: shareButtonMocks.authDrawerShow,
  },
}));

vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: () => ({
    createShortCode: shareButtonMocks.createShortCode,
  }),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  showToast: shareButtonMocks.showToast,
}));

vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logShareAction: vi.fn(),
}));

vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("$lib/shared/inbox/state/send-sequence-state.svelte", () => ({
  buildSequenceSharePayload: shareButtonMocks.buildSequenceSharePayload,
  openSendSequenceSheet: shareButtonMocks.openSendSequenceSheet,
}));

const sequence = createSequenceData({
  id: "copy-link",
  name: "Copy Link",
  word: "COPY",
  steps: [createStepData({ letter: "A" })],
});

let originalClipboardDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  shareButtonMocks.showToast.mockClear();
  shareButtonMocks.createShortCode.mockClear();
  shareButtonMocks.openSendSequenceSheet.mockClear();
  shareButtonMocks.authDrawerShow.mockClear();
  shareButtonMocks.getCardImageBlob.mockReset();
  shareButtonMocks.getCardImageBlob.mockResolvedValue(
    new Blob(["card"], {
      type: "image/png",
    })
  );
  shareButtonMocks.buildSequenceSharePayload.mockClear();
  shareButtonMocks.fullAccount = true;
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard"
  );
});

afterEach(() => {
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("ShareButton", () => {
  it("opens the unified card-only share sheet directly", async () => {
    render(ShareButton, { sequence });

    await page.getByRole("button", { name: "Share sequence" }).click();

    await expect
      .element(page.getByRole("dialog", { name: "Share this sequence" }))
      .toBeInTheDocument();
    await expect.element(page.getByText("Card footer")).toBeInTheDocument();
    await expect
      .element(page.getByRole("textbox", { name: "Caption", exact: true }))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Video", { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("menuitem", { name: "Send Sequence" }))
      .not.toBeInTheDocument();
  });

  it("lets guests open the card-only share draft without minting account data", async () => {
    shareButtonMocks.fullAccount = false;
    render(ShareButton, { sequence });

    await page.getByRole("button", { name: "Share sequence" }).click();

    await expect
      .element(page.getByRole("dialog", { name: "Share this sequence" }))
      .toBeInTheDocument();
    expect(shareButtonMocks.authDrawerShow).not.toHaveBeenCalled();
    expect(shareButtonMocks.createShortCode).not.toHaveBeenCalled();
    expect(shareButtonMocks.openSendSequenceSheet).not.toHaveBeenCalled();
    await expect
      .element(page.getByText("Video", { exact: true }))
      .not.toBeInTheDocument();
  });
});
