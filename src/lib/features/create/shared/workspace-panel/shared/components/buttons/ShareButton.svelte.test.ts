import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import demo from "$lib/shared/landing/data/demo-sequence.json";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
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

const workspaceVideoMocks = vi.hoisted(() => ({
  executeExport: vi.fn(),
  createController: vi.fn(),
  controller: {
    initialize: vi.fn(() => true),
    dispose: vi.fn(),
  },
  panelState: {
    reset: vi.fn(),
    dispose: vi.fn(),
  },
  downloadArtifact: vi.fn(),
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

vi.mock("$lib/shared/animation-engine/get-video-export-orchestrator", () => ({
  tryGetVideoExportOrchestrator: () => null,
  ensureVideoExportOrchestrator: () =>
    Promise.resolve({
      executeExport: workspaceVideoMocks.executeExport,
    }),
}));

vi.mock(
  "$lib/features/compose/services/animation-playback-controller-factory",
  () => ({
    createAnimationPlaybackController: workspaceVideoMocks.createController,
  })
);

vi.mock("$lib/shared/animation-engine/state/animation-panel-state.svelte", () => ({
  createAnimationPanelState: () => workspaceVideoMocks.panelState,
}));

vi.mock("$lib/shared/share/get-sharer", () => ({
  getSharer: () => ({
    getCardImageBlob: shareButtonMocks.getCardImageBlob,
    generateFilename: vi.fn(() => "sequence.png"),
  }),
}));

vi.mock("$lib/shared/share/services/post-handoff", async (original) => ({
  ...(await original<typeof import("$lib/shared/share/services/post-handoff")>()),
  downloadArtifact: workspaceVideoMocks.downloadArtifact,
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

// Card pixels belong to the render-parity suite. This workspace control test
// exercises the chooser and file type boundary without starting its renderer.
vi.mock("$lib/shared/share/components/LiveExportCard.svelte", async () => ({
  default: (
    await import("$lib/shared/auth/components/__test-stubs__/EmailAuthMethodStub.svelte")
  ).default,
}));

vi.mock("$lib/shared/pictograph/shared/state/visibility-state.svelte", () => ({
  getVisibilityStateManager: () => ({
    getGridVisibility: () => true,
    getRawGlyphVisibility: () => false,
    getNonRadialVisibility: () => false,
    getHandPointVisibility: () => false,
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
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    image: vi.fn(),
  },
}));

vi.mock(
  "$lib/shared/analytics/services/posthog-activity-logger",
  async (original) => ({
    ...(await original<
      typeof import("$lib/shared/analytics/services/posthog-activity-logger")
    >()),
    logShareAction: vi.fn(),
  })
);

vi.mock("$lib/shared/analytics/services/posthog", async (original) => ({
  ...(await original<
    typeof import("$lib/shared/analytics/services/posthog")
  >()),
  captureEvent: vi.fn(),
}));

vi.mock("$lib/shared/inbox/state/send-sequence-state.svelte", () => ({
  buildSequenceSharePayload: shareButtonMocks.buildSequenceSharePayload,
  openSendSequenceSheet: shareButtonMocks.openSendSequenceSheet,
}));

const sequence = {
  ...structuredClone(demo),
  id: "workspace-share-video",
  steps: structuredClone(demo.steps).slice(0, 4),
  word: demo.steps
    .slice(0, 4)
    .map((step) => step.letter)
    .join(""),
} as unknown as SequenceData;

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
  workspaceVideoMocks.executeExport.mockReset();
  workspaceVideoMocks.executeExport.mockImplementation(
    async (_canvas, _controller, _panelState, reportProgress) => {
      reportProgress({ stage: "complete", progress: 1, totalFrames: 4 });
      return new Blob(["workspace-video"], { type: "video/mp4" });
    }
  );
  workspaceVideoMocks.createController.mockReset();
  workspaceVideoMocks.createController.mockReturnValue(
    workspaceVideoMocks.controller
  );
  workspaceVideoMocks.controller.initialize.mockClear();
  workspaceVideoMocks.controller.dispose.mockClear();
  workspaceVideoMocks.panelState.reset.mockClear();
  workspaceVideoMocks.panelState.dispose.mockClear();
  workspaceVideoMocks.downloadArtifact.mockReset();
  workspaceVideoMocks.downloadArtifact.mockResolvedValue({ status: "done" });
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
  it("opens the share chooser and offers video in Download a file", async () => {
    render(ShareButton, { sequence });

    await page.getByRole("button", { name: "Share sequence" }).click();

    await expect
      .element(page.getByRole("dialog", { name: "Share sequence" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Save the current view as a video or card image"))
      .toBeInTheDocument();
    await page.getByRole("button", { name: /Download a file/ }).click();
    await expect
      .element(page.getByRole("dialog", { name: "Download card" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("group", { name: "File type" }))
      .toBeInTheDocument();
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect
      .element(page.getByRole("dialog", { name: "Download animation" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("menuitem", { name: "Send Sequence" }))
      .not.toBeInTheDocument();
  });

  it("renders the workspace snapshot offscreen and downloads its returned video", async () => {
    render(ShareButton, { sequence });

    await page.getByRole("button", { name: "Share sequence" }).click();
    await page.getByRole("button", { name: /Download a file/ }).click();
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await page.getByRole("button", { name: "Download video" }).click();

    await vi.waitFor(() =>
      expect(workspaceVideoMocks.executeExport).toHaveBeenCalledTimes(1)
    );
    const [canvas, controller, panelState, _reportProgress, options] =
      workspaceVideoMocks.executeExport.mock.calls[0] ?? [];
    expect(canvas).toMatchObject({ width: 600, height: 600 });
    expect(controller).toBe(workspaceVideoMocks.controller);
    expect(panelState).toBe(workspaceVideoMocks.panelState);
    expect(options).toMatchObject({
      compositeMode: "none",
      autoDownload: false,
      resolution: 1080,
      fps: 60,
      loopCount: 1,
      includeAnimationStartPlacement: true,
      includeEndHold: true,
    });
    expect(workspaceVideoMocks.createController).toHaveBeenCalledWith(
      undefined,
      { syncSharedWorkspaceState: false }
    );
    expect(workspaceVideoMocks.controller.initialize).toHaveBeenCalledWith(
      sequence,
      workspaceVideoMocks.panelState
    );

    await vi.waitFor(() =>
      expect(workspaceVideoMocks.downloadArtifact).toHaveBeenCalledTimes(1)
    );
    const [downloadedBlob, filename] =
      workspaceVideoMocks.downloadArtifact.mock.calls[0] ?? [];
    expect(downloadedBlob).toMatchObject({ type: "video/mp4" });
    await expect(downloadedBlob.text()).resolves.toBe("workspace-video");
    expect(filename).toMatch(/\.mp4$/);
  });

  it("lets guests reach the file chooser without minting account data", async () => {
    shareButtonMocks.fullAccount = false;
    render(ShareButton, { sequence });

    await page.getByRole("button", { name: "Share sequence" }).click();

    await expect
      .element(page.getByRole("dialog", { name: "Share sequence" }))
      .toBeInTheDocument();
    expect(shareButtonMocks.authDrawerShow).not.toHaveBeenCalled();
    expect(shareButtonMocks.createShortCode).not.toHaveBeenCalled();
    expect(shareButtonMocks.openSendSequenceSheet).not.toHaveBeenCalled();
    await page.getByRole("button", { name: /Download a file/ }).click();
    await expect
      .element(page.getByRole("group", { name: "File type" }))
      .toBeInTheDocument();
  });
});
