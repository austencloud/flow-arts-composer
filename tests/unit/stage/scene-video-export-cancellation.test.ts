import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const mocks = vi.hoisted(() => ({
  ensureFullAccountForExport: vi.fn(),
  cancelSharedExport: vi.fn(),
  export3DAnimation: vi.fn(),
  clearError: vi.fn(),
  dismissPreview: vi.fn(),
  getVideoOptions: vi.fn(),
  sharedState: {
    isExporting: false,
    progress: null,
    error: null,
    previewBlobUrl: null,
  },
}));

vi.mock("#lib/shared/auth/domain/export-gate.js", () => ({
  ensureFullAccountForExport: mocks.ensureFullAccountForExport,
}));

vi.mock(
  "#lib/shared/animation-panel/state/export-options-state.svelte.js",
  () => ({
    getExportOptionsState: () => ({ getVideoOptions: mocks.getVideoOptions }),
  })
);

vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.js",
  () => ({
    sequenceModalExporter: {
      get state() {
        return mocks.sharedState;
      },
      cancel: mocks.cancelSharedExport,
      export3DAnimation: mocks.export3DAnimation,
      clearError: mocks.clearError,
      dismissPreview: mocks.dismissPreview,
    },
  })
);

import { createSceneVideoExport } from "#lib/features/stage/scene/services/create-scene-video-export.svelte.js";

describe("Scene Studio video export cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sharedState.isExporting = false;
    mocks.sharedState.progress = null;
    mocks.sharedState.error = null;
    mocks.sharedState.previewBlobUrl = null;
  });

  it("enters a cancellable state before account and scene startup finish", async () => {
    let releaseAccountGate!: (allowed: boolean) => void;
    mocks.ensureFullAccountForExport.mockReturnValue(
      new Promise<boolean>((resolve) => {
        releaseAccountGate = resolve;
      })
    );

    const viewer = {
      webglCanvas: null,
      threlteCamera: null,
      threlteRenderer: null,
      threlteRunFrame: null,
      threltePauseAutoLoop: null,
      threlteResumeAutoLoop: null,
    } as unknown as Parameters<typeof createSceneVideoExport>[0];
    const exporter = createSceneVideoExport(viewer);
    const sequence = { steps: [] } as unknown as SequenceData;

    const renderResult = exporter.render(sequence, 120);

    expect(exporter.state.isExporting).toBe(true);
    expect(exporter.state.isCancelling).toBe(false);

    exporter.cancel();

    expect(exporter.state.isCancelling).toBe(true);
    expect(mocks.cancelSharedExport).toHaveBeenCalledOnce();

    releaseAccountGate(true);
    await expect(renderResult).resolves.toBe(false);

    expect(exporter.state.isExporting).toBe(false);
    expect(exporter.state.isCancelling).toBe(false);
    expect(mocks.export3DAnimation).not.toHaveBeenCalled();
  });
});
