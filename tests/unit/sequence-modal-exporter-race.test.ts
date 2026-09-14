import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const pending: Array<{
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    progress: (value: { stage: string; progress: number }) => void;
  }> = [];
  return {
    pending,
    cancelExport: vi.fn(),
    executeExport: vi.fn(
      (
        _canvas,
        _playback,
        _panel,
        progress: (value: { stage: string; progress: number }) => void
      ) =>
        new Promise<Blob>((resolve, reject) =>
          pending.push({ resolve, reject, progress })
        )
    ),
  };
});

vi.mock("$lib/shared/animation-engine/get-video-export-orchestrator", () => ({
  tryGetVideoExportOrchestrator: () => ({
    executeExport: mocks.executeExport,
    cancelExport: mocks.cancelExport,
  }),
  ensureVideoExportOrchestrator: vi.fn(),
}));
vi.mock("$lib/shared/render/get-sequence-renderer", () => ({
  getSequenceRenderer: vi.fn(),
}));
vi.mock("$lib/shared/foundation/services/file-downloader", () => ({
  sanitizeFilename: (value: string) => value,
}));
vi.mock("$lib/shared/foundation/utils/word-simplifier", () => ({
  simplifyRepeatedWord: (value: string) => value,
}));
vi.mock("$lib/shared/animation-panel/state/export-timing-tracker", () => ({
  recordExportThroughput: vi.fn(),
}));
vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logShareAction: vi.fn(),
}));
vi.mock("$lib/shared/3d/get-offline-3d-exporter", () => ({
  getOffline3DExporter: vi.fn(),
}));
vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: { settings: {} },
}));

import {
  SequenceModalExporter,
  type ExportCallbacks,
  type VideoExportDependencies,
  type VideoExportOptions,
} from "$lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte";

function callbacks(): ExportCallbacks {
  return { onSuccess: vi.fn(), onError: vi.fn(), onHaptic: vi.fn() };
}

const options: VideoExportOptions = { fps: 30, loopCount: 1, resolution: 720 };
const dependencies = {} as VideoExportDependencies;

describe("SequenceModalExporter cancellation races", () => {
  beforeEach(() => {
    mocks.pending.length = 0;
    vi.clearAllMocks();
    let createdUrl = 0;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:export-${++createdUrl}`),
      revokeObjectURL: vi.fn(),
    });
  });

  it("keeps a retry active when the canceled render reports late progress and fails", async () => {
    const exporter = new SequenceModalExporter();
    const first = exporter.exportAnimation(options, dependencies, callbacks());
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(1));
    exporter.cancel();
    const second = exporter.exportAnimation(options, dependencies, callbacks());
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(2));

    mocks.pending[0].progress({ stage: "complete", progress: 1 });
    mocks.pending[0].reject(new Error("old render failed"));
    await first;

    expect(exporter.state.isExporting).toBe(true);
    expect(exporter.state.progress).toEqual({
      progress: 0,
      stage: "capturing",
    });
    expect(exporter.state.error).toBeNull();

    mocks.pending[1].resolve(new Blob(["new retry result"]));
    await second;

    expect(exporter.state.previewBlobUrl).toBe("blob:export-1");
    expect(exporter.state.isExporting).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.cancelExport).toHaveBeenCalledOnce();
  });

  it("does not replace a completed retry with the canceled render's late file", async () => {
    const exporter = new SequenceModalExporter();
    const first = exporter.exportAnimation(options, dependencies, callbacks());
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(1));
    exporter.cancel();
    const second = exporter.exportAnimation(options, dependencies, callbacks());
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(2));
    const retryBlob = new Blob(["retry result"]);
    mocks.pending[1].resolve(retryBlob);
    await second;
    mocks.pending[0].resolve(new Blob(["canceled result"]));
    await first;

    expect(exporter.state.previewBlobUrl).toBe("blob:export-1");
    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(retryBlob);
    expect(exporter.state.isExporting).toBe(false);
  });
});
