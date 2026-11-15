// @vitest-environment jsdom
// Guests export with no sign-up box first (Austen, 2026-11-14: "Yes, let them").
// The ask used to open on tap and leave the viewer's button spinning; a broken
// gate shows nothing on screen, so this guards it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exportAnimation: vi.fn(async () => {}),
  showAuthDrawer: vi.fn(),
  state: {
    isExporting: false,
    progress: null,
    error: null,
    previewBlobUrl: null,
  },
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: true,
    isFullAccount: false,
  },
  learnWhoIsSignedIn: vi.fn(async () => {}),
}));
vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { show: mocks.showAuthDrawer, open: false },
}));
vi.mock(
  "#lib/shared/animation-panel/state/export-options-state.svelte.js",
  () => ({
    getExportOptionsState: () => ({
      getVideoOptions: () => ({ fps: 30, loopCount: 1, resolution: 720 }),
    }),
  })
);
vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.js",
  () => ({
    sequenceModalExporter: {
      get state() {
        return mocks.state;
      },
      cancel: vi.fn(),
      clearError: vi.fn(),
      dismissPreview: vi.fn(),
      dispose: vi.fn(),
      export3DAnimation: vi.fn(),
      exportAnimation: mocks.exportAnimation,
      exportImage: vi.fn(),
    },
  })
);

import { createExportCoordinator } from "#lib/shared/sequence-viewer/components/export-coordinator.svelte.js";

describe("guest export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a guest's tunnel video with no sign-up box", async () => {
    const coordinator = createExportCoordinator({
      getViewer3DState: () => null as never,
      accessibilityHelper: { announce: vi.fn() } as never,
    });

    const started = await coordinator.exportTunnel(
      {} as never,
      {} as never,
      null,
      () => [],
      false,
      null
    );

    expect(started).toBe(true);
    expect(mocks.exportAnimation).toHaveBeenCalledOnce();
    expect(mocks.showAuthDrawer).not.toHaveBeenCalled();
  });
});
