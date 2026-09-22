import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const mocks = vi.hoisted(() => ({
  ensureFullAccountForExport: vi.fn(),
  saveFilmRecipe: vi.fn(),
  export3DAnimation: vi.fn(),
  cancel: vi.fn(),
  getVideoOptions: vi.fn(),
  state: {
    isExporting: false,
    progress: null,
    error: null,
    previewBlobUrl: null,
  },
}));

vi.mock("$lib/shared/auth/domain/export-gate", () => ({
  ensureFullAccountForExport: mocks.ensureFullAccountForExport,
}));
vi.mock(
  "$lib/shared/animation-panel/state/export-options-state.svelte",
  () => ({
    getExportOptionsState: () => ({ getVideoOptions: mocks.getVideoOptions }),
  })
);
vi.mock("$lib/features/scene-3d-collection/services/save-film-recipe", () => ({
  saveFilmRecipe: mocks.saveFilmRecipe,
  updateFilmRenderOptions: vi.fn(),
}));
vi.mock("$lib/shared/video-export/services/rendered-film-store", () => ({
  putRenderedFilm: vi.fn(),
  pruneRenderedFilms: vi.fn(),
}));
vi.mock(
  "$lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte",
  () => ({
    sequenceModalExporter: {
      get state() {
        return mocks.state;
      },
      cancel: mocks.cancel,
      clearError: vi.fn(),
      dismissPreview: vi.fn(),
      dispose: vi.fn(),
      export3DAnimation: mocks.export3DAnimation,
      exportAnimation: vi.fn(),
      exportImage: vi.fn(),
    },
  })
);

import { createExportCoordinator } from "$lib/shared/sequence-viewer/components/export-coordinator.svelte";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createCoordinator() {
  const camera = {
    position: { x: 0, y: 1, z: 2, set: vi.fn() },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set: vi.fn() },
    fov: 50,
    updateProjectionMatrix: vi.fn(),
  };
  const viewer3DState = {
    renderMode: "3d",
    webglCanvas: document.createElement("canvas"),
    threlteCamera: camera,
    threlteRenderer: {},
    threlteRunFrame: vi.fn(),
    threltePauseAutoLoop: vi.fn(),
    threlteResumeAutoLoop: vi.fn(),
    performerManager: { performers: [] },
    cameraChoreography: { activePresetId: null, activePreset: null },
  };
  return createExportCoordinator({
    viewer3DState: viewer3DState as never,
    accessibilityHelper: { announce: vi.fn() } as never,
  });
}

describe("scene take lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.ensureFullAccountForExport.mockResolvedValue(true);
    mocks.getVideoOptions.mockReturnValue({
      fps: 30,
      loopCount: 1,
      resolution: 720,
      quality: "standard",
      includeStartPlacement: false,
      includeEndHold: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the take active during recipe storage and honors a cancel that arrives there", async () => {
    const saved = deferred<{ id: string } | null>();
    mocks.saveFilmRecipe.mockReturnValue(saved.promise);
    const coordinator = createCoordinator();
    const exportResult = coordinator.handleExport(
      "animation",
      { steps: [{ duration: 1 }] } as unknown as SequenceData,
      {} as never,
      { speed: 1 } as never,
      null,
      false,
      120,
      false,
      null,
      { autoDeliver: false }
    );

    for (let turn = 0; turn < 10 && !coordinator.isRecording3D; turn += 1)
      await Promise.resolve();
    expect(coordinator.isRecording3D).toBe(true);
    vi.advanceTimersByTime(20);
    coordinator.handleStopRecording();
    for (
      let turn = 0;
      turn < 10 && !mocks.saveFilmRecipe.mock.calls.length;
      turn += 1
    )
      await Promise.resolve();

    expect(coordinator.isRecording3D).toBe(false);
    expect(coordinator.sceneTakeActive).toBe(true);
    expect(coordinator.pendingFilmRender).toBeNull();

    coordinator.handleCancelExport();
    saved.resolve({ id: "film-1" });

    await expect(exportResult).resolves.toBe(false);
    expect(coordinator.sceneTakeActive).toBe(false);
    expect(mocks.export3DAnimation).not.toHaveBeenCalled();
  });
});
