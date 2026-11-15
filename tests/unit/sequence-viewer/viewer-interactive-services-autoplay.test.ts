import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { isViewerReadyToAutoplay } from "#lib/shared/sequence-viewer/services/viewer-autoplay-readiness.js";
import { shouldAutoplayViewer } from "#lib/shared/sequence-viewer/services/viewer-autoplay-policy.js";
import { createViewerInteractiveServicesState } from "#lib/shared/sequence-viewer/state/viewer-interactive-services-state.svelte.js";

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
  deferredStartup?: boolean;
  failServices?: boolean;
  animationDrawn?: boolean;
}) {
  let animationDrawn = options?.animationDrawn ?? true;
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
      deferredStartup: options?.deferredStartup,
      getAnimationDrawn: () => animationDrawn,
      getCellsLoaded: () => loadedCells,
      getTotalCells: () => totalCells,
      getViewMode: () => "split",
      getPlaybackReleased: () => playbackReleased,
    },
    {
      getAnimationPlaybackController: () => {
        if (options?.failServices) throw new Error("no controller");
        return playbackController;
      },
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
    drawAnimation() {
      animationDrawn = true;
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

describe("viewer deferred startup", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads as loading until a deferred scan starts its animation", async () => {
    // The scan opens on Side by Side with services held until the card has
    // painted; the motion pane holds its slot with its loading state.
    const harness = createHarness({ deferredStartup: true });
    expect(harness.state.animationLoading).toBe(true);
    harness.state.ensureInteractiveServices();
    await Promise.resolve();
    await harness.state.initializeAnimation(sequence);
    expect(harness.state.animationLoading).toBe(false);
    harness.dispose();
  });

  it("does not read as loading for hosts that start services at once", () => {
    const harness = createHarness();
    expect(harness.state.animationLoading).toBe(false);
    harness.dispose();
  });

  it("lets a failed deferred start show its error instead of loading forever", async () => {
    const harness = createHarness({ deferredStartup: true, failServices: true });
    harness.state.ensureInteractiveServices();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.state.animationLoading).toBe(false);
    harness.dispose();
  });
});

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

  it("holds a deferred scan's playback until the canvas has drawn its first frame", async () => {
    // The film: the beat count ran over an empty canvas while the grid and
    // prop textures were still loading.
    const harness = createHarness({
      deferredStartup: true,
      animationDrawn: false,
    });

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);
    vi.advanceTimersByTime(500);
    expect(harness.togglePlayback).not.toHaveBeenCalled();

    harness.drawAnimation();
    vi.advanceTimersByTime(50);
    expect(harness.togglePlayback).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it("does not hold hosts that start services at once on the canvas", async () => {
    const harness = createHarness({ animationDrawn: false });

    harness.state.ensureInteractiveServices();
    await harness.state.initializeAnimation(sequence);

    expect(harness.togglePlayback).toHaveBeenCalledOnce();
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
