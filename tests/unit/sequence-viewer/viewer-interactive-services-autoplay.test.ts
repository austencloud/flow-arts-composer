import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isViewerReadyToAutoplay } from "$lib/shared/sequence-viewer/services/viewer-autoplay-readiness";
import { shouldAutoplayViewer } from "$lib/shared/sequence-viewer/services/viewer-autoplay-policy";
import { createViewerInteractiveServicesState } from "$lib/shared/sequence-viewer/state/viewer-interactive-services-state.svelte";

const sequence = {
  id: "qr-autoplay",
  word: "WOW",
  steps: [],
} as unknown as SequenceData;

function createHarness(options?: {
  loadedCells?: number;
  totalCells?: number;
  reducedMotion?: boolean;
  ignoredStarts?: number;
  playbackReleased?: boolean;
  hydrateSequence?: (sequence: SequenceData) => Promise<SequenceData>;
}) {
  let loadedCells = options?.loadedCells ?? 5;
  let totalCells = options?.totalCells ?? 5;
  let isPlaying = false;
  let ignoredStarts = options?.ignoredStarts ?? 0;
  let playbackReleased = options?.playbackReleased ?? true;
  const togglePlayback = vi.fn(() => {
    if (ignoredStarts > 0) {
      ignoredStarts -= 1;
      return;
    }
    isPlaying = !isPlaying;
  });
  const playbackController = {
    initialize: vi.fn(() => true),
    updateSequenceData: vi.fn(),
    setSpeed: vi.fn(),
    togglePlayback,
  } as unknown as AnimationPlaybackController;
  const modalAnimationState = createAnimationPanelState({ ephemeral: true });

  const state = createViewerInteractiveServicesState(
    {
      modalAnimationState,
      playback: {
        get isPlayingLocal() {
          return isPlaying;
        },
        bpmLocal: 60,
        setPlaybackController: vi.fn(),
        setHapticService: vi.fn(),
        setAnimationVisible: vi.fn(),
      } as never,
      viewerState: { viewerMode: "split" } as never,
      cloudBackedScan: true,
      getCellsLoaded: () => loadedCells,
      getTotalCells: () => totalCells,
      getViewMode: () => "split",
      getPlaybackReleased: () => playbackReleased,
    },
    {
      getAnimationPlaybackController: () => playbackController,
      getHapticFeedback: () => ({}) as never,
      getLanSyncCoordinator: () => ({}) as never,
      initializeLanSync: vi.fn(),
      hydrateSequence: options?.hydrateSequence ?? (async (value) => value),
      preWarmSequence: vi.fn(),
      setAnimationPlaybackRef: vi.fn(),
      isViewerReadyToAutoplay,
      shouldAutoplayViewer,
      getSettings: () =>
        ({
          reducedMotion: options?.reducedMotion ?? false,
        }) as never,
    }
  );

  return {
    state,
    playbackController,
    togglePlayback,
    setProgress(loaded: number, total: number) {
      loadedCells = loaded;
      totalCells = total;
    },
    releasePlayback() {
      playbackReleased = true;
    },
    holdPlayback() {
      playbackReleased = false;
    },
    dispose: () => modalAnimationState.dispose(),
  };
}

describe("viewer interactive autoplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("discards an in-flight preview when saved paths are restored", async () => {
    let resolvePreview!: (value: SequenceData) => void;
    const changed = { ...sequence, word: "preview" };
    const harness = createHarness({
      hydrateSequence: (value) =>
        value === changed
          ? new Promise((resolve) => {
              resolvePreview = resolve;
            })
          : Promise.resolve(value),
    });
    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);
    const pending = harness.state.initializeAnimation(changed);
    await harness.state.initializeAnimation(sequence);
    resolvePreview(changed);
    await pending;
    expect(
      harness.playbackController.updateSequenceData
    ).not.toHaveBeenCalled();
    harness.dispose();
  });

  it("refreshes changed motion content without restarting the same sequence", async () => {
    const harness = createHarness();
    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);
    const changed = { ...sequence, word: "changed" };
    await harness.state.initializeAnimation(changed);
    expect(harness.playbackController.initialize).toHaveBeenCalledOnce();
    expect(harness.playbackController.updateSequenceData).toHaveBeenCalledWith(
      changed
    );
    expect(harness.togglePlayback).toHaveBeenCalledOnce();
    await harness.state.initializeAnimation(changed);
    expect(
      harness.playbackController.updateSequenceData
    ).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it("starts a ready QR animation immediately without waiting for a timer", async () => {
    const harness = createHarness();

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);

    expect(harness.togglePlayback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    harness.dispose();
  });

  it("keeps polling until an unfinished QR card becomes ready", async () => {
    const harness = createHarness({ loadedCells: 2, totalCells: 5 });

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);

    expect(harness.togglePlayback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    harness.setProgress(5, 5);
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.togglePlayback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    harness.dispose();
  });

  it("retries when the first ready-state start is ignored", async () => {
    const harness = createHarness({ ignoredStarts: 1 });

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);

    expect(harness.togglePlayback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(50);

    expect(harness.togglePlayback).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    harness.dispose();
  });

  it("holds autoplay until the native splash has been revealed", async () => {
    const harness = createHarness({ playbackReleased: false });

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);

    expect(harness.togglePlayback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    harness.releasePlayback();
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.togglePlayback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    harness.dispose();
  });

  it("pauses existing playback before the splash and resumes after reveal", async () => {
    const harness = createHarness();

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);
    expect(harness.togglePlayback).toHaveBeenCalledOnce();

    harness.holdPlayback();
    harness.state.syncPlaybackRelease(false);
    expect(harness.togglePlayback).toHaveBeenCalledTimes(2);

    harness.releasePlayback();
    harness.state.syncPlaybackRelease(true);
    expect(harness.togglePlayback).toHaveBeenCalledTimes(3);
    harness.dispose();
  });

  it("keeps a ready QR animation still when reduced motion is enabled", async () => {
    const harness = createHarness({ reducedMotion: true });

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);

    expect(harness.togglePlayback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    harness.dispose();
  });
});
