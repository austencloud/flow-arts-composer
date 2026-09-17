// @vitest-environment jsdom

import { effect_root } from "svelte/internal/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import type { OrchestratorContext } from "$lib/shared/sequence-viewer/domain/viewer-orchestrator-context";
import { createViewerEditModeState } from "$lib/shared/sequence-viewer/state/viewer-edit-mode-state.svelte";
import { createViewerShellLayoutState } from "$lib/shared/sequence-viewer/state/viewer-shell-layout-state.svelte";
import { DURATION, STAGGER } from "$lib/shared/transitions/transitions";
import type {
  ExportContext,
  SplitConfig,
  ViewerMode,
} from "$lib/shared/sequence-viewer/state/viewer-state.svelte";

/**
 * Slack for the two settled paints the Card size pin waits on before it clears.
 *
 * The pin releases on requestAnimationFrame rather than on the timer itself, so
 * a test that only advances to the clock would read the pin as still set.
 */
const SETTLE_FRAMES_MS = 64;

const sequence = {
  id: "card-playback",
  word: "AB",
  steps: [],
} as unknown as SequenceData;

function createHarness(
  initialPlaying: boolean,
  resolvedCardAutoLayout: ResolvedAutoLayout | null = null
) {
  let playing = initialPlaying;
  let viewerMode: ViewerMode = "animation";
  let exportContext: ExportContext = "animation-export";
  let videoUploadOpen = false;
  let splitConfig: SplitConfig = {
    leftPane: "animation",
    rightPane: "card",
  };

  const togglePlayback = vi.fn(() => {
    playing = !playing;
  });
  const viewerState = {
    get viewerMode() {
      return viewerMode;
    },
    get exportContext() {
      return exportContext;
    },
    get videoUploadOpen() {
      return videoUploadOpen;
    },
    get splitConfig() {
      return splitConfig;
    },
    enterExport(
      type: "animation-export" | "image-export",
      contentType?: "animation" | "animation-3d"
    ) {
      viewerMode =
        type === "image-export" ? "card" : (contentType ?? "animation");
      exportContext = type;
      videoUploadOpen = false;
    },
    exitExport() {
      exportContext = null;
    },
    setViewerMode(mode: ViewerMode) {
      viewerMode = mode;
      videoUploadOpen = false;
    },
    openVideoUpload() {
      viewerMode = "videos";
      exportContext = null;
      videoUploadOpen = true;
    },
    closeVideoUpload() {
      videoUploadOpen = false;
    },
    setSplitConfig(config: SplitConfig) {
      splitConfig = config;
    },
  };

  const editMode = createViewerEditModeState({
    viewerState: viewerState as never,
    playback: {
      get isPlayingLocal() {
        return playing;
      },
    } as never,
    interactive: {
      playbackController: { togglePlayback },
      hapticService: null,
    } as never,
    exportCoordinator: { dismissPreview: vi.fn() } as never,
    modalAnimationState: {} as never,
    accessibilityHelper: { announce: vi.fn() } as never,
    getEditingPane: () =>
      exportContext === "image-export"
        ? "image"
        : exportContext === "animation-export"
          ? "animation"
          : null,
    getEffectiveSequence: () => sequence,
    getIsHandPath: () => false,
    getResolvedCardAutoLayout: () => null,
  });

  const context = {
    viewerState,
    get editingPane() {
      return exportContext === "image-export"
        ? "image"
        : exportContext === "animation-export"
          ? "animation"
          : null;
    },
    get isPlayingLocal() {
      return playing;
    },
    get bpmLocal() {
      return 60;
    },
    get currentStepLocal() {
      return 3;
    },
    get cardReady() {
      return false;
    },
    get resolvedCardAutoLayout() {
      return resolvedCardAutoLayout;
    },
    ensureInteractiveServices: vi.fn(),
    enterEditMode: editMode.enterEditMode,
    exitEditMode: editMode.exitEditMode,
    handlePlaybackToggle: togglePlayback,
  } as unknown as OrchestratorContext;

  let layout!: ReturnType<typeof createViewerShellLayoutState>;
  const dispose = effect_root(() => {
    layout = createViewerShellLayoutState(
      {
        getContext: () => context,
        getSequence: () => sequence,
        getIsMobile: () => true,
        getSendModeActive: () => false,
        getWorkspaceElement: () => null,
        startInSplit: false,
        startInCardThenSplit: false,
      },
      {
        getDeviceDetector: vi.fn(),
        captureScanSettingChanged: vi.fn(),
        captureScanViewChanged: vi.fn(),
        captureScanViewerOpened: vi.fn(),
        captureScanPlaybackChanged: vi.fn(),
      }
    );
  });

  return {
    layout,
    editMode,
    dispose,
    togglePlayback,
    get playing() {
      return playing;
    },
    get viewerMode() {
      return viewerMode;
    },
    get exportContext() {
      return exportContext;
    },
    get videoUploadOpen() {
      return videoUploadOpen;
    },
  };
}

const disposals: Array<() => void> = [];

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.motionPreference;
  while (disposals.length > 0) disposals.pop()?.();
});

describe("sequence viewer Card playback", () => {
  it("pauses for Card and resumes when the running animation returns", () => {
    const harness = createHarness(true);
    disposals.push(harness.dispose);

    harness.layout.selectViewerMode("card");
    expect(harness.viewerMode).toBe("card");
    expect(harness.playing).toBe(false);

    harness.layout.selectViewerMode("animation");
    expect(harness.viewerMode).toBe("animation");
    expect(harness.playing).toBe(true);
    expect(harness.togglePlayback).toHaveBeenCalledTimes(2);
  });

  it("keeps an intentionally paused animation paused across Card", () => {
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    harness.layout.selectViewerMode("card");
    harness.layout.selectViewerMode("animation");

    expect(harness.playing).toBe(false);
    expect(harness.togglePlayback).not.toHaveBeenCalled();
  });

  it("lets the focused Card pick its own grid, and leases the one it leaves behind", () => {
    vi.useFakeTimers();
    const resolved = {
      cols: 4,
      rows: 3,
      startPlacement: "row",
      widthUnits: 4,
      stepCount: 0,
    } satisfies ResolvedAutoLayout;
    const harness = createHarness(false, resolved);
    disposals.push(harness.dispose);

    harness.layout.rememberReadableCardAutoLayout(resolved, 322, 280);
    harness.layout.selectViewerMode("card");

    // Entering Card must not lease. The Card solves against the box its pane is
    // heading toward, so there is no sliver to protect it from -- and a lease
    // would pin the Side-by-Side grid onto the focused Card for the whole visit.
    expect(harness.layout.cardAutoLayoutOverride).toBeNull();
    vi.advanceTimersByTime(DURATION.emphasis * 2);
    expect(harness.layout.cardAutoLayoutOverride).toBeNull();

    // Leaving Card still leases: the Card it leaves behind sits in a collapsing
    // pane, and its last readable shape has to outlive that collapse.
    harness.layout.selectViewerMode("animation");
    expect(harness.layout.cardAutoLayoutOverride).toEqual(resolved);
    vi.advanceTimersByTime(DURATION.emphasis - 1);
    expect(harness.layout.cardAutoLayoutOverride).toEqual(resolved);
    vi.advanceTimersByTime(1);
    expect(harness.layout.cardAutoLayoutOverride).toEqual(resolved);
    vi.advanceTimersByTime(32);
    expect(harness.layout.cardAutoLayoutOverride).toBeNull();
  });

  it("rejects the wide shallow Card grid measured while a pane collapses", () => {
    const stable = {
      cols: 4,
      rows: 3,
      startPlacement: "row",
      widthUnits: 4,
      stepCount: 0,
    } satisfies ResolvedAutoLayout;
    const collapsing = {
      cols: 5,
      rows: 2,
      startPlacement: "row",
      widthUnits: 5,
      stepCount: 0,
    } satisfies ResolvedAutoLayout;
    const harness = createHarness(false, collapsing);
    disposals.push(harness.dispose);

    harness.layout.rememberReadableCardAutoLayout(stable, 322, 280);
    // Measured through a pane that is already collapsing: too small in one
    // dimension to be a readable Card, so it must not replace the stable shape.
    harness.layout.rememberReadableCardAutoLayout(collapsing, 375, 186);
    harness.layout.selectViewerMode("card");
    harness.layout.selectViewerMode("animation");

    expect(harness.layout.cardAutoLayoutOverride).toEqual(stable);
  });

  it("returns the inspector and split panes in one state commit", () => {
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    harness.layout.selectViewerMode("card");
    harness.layout.selectSplitMode();

    expect(harness.exportContext).toBeNull();
    expect(harness.viewerMode).toBe("split");
  });

  it("keeps contained Card sizing on for the workspace handoff and its settle", () => {
    vi.useFakeTimers();
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    // The pin is the only thing that puts a width and height transition on the
    // Card's contained box, so it outlives the workspace allocation by one
    // emphasis and is then released two settled paints later. A ResizeObserver
    // delivery landing on the frame the clock expires is still carried by the
    // transition it was measured under.
    const pinLifetime = DURATION.emphasis + DURATION.normal + DURATION.emphasis;

    harness.layout.selectSplitMode();
    harness.layout.selectViewerMode("card");
    expect(harness.layout.cardContainSizeMotion).toBe("focus");
    vi.advanceTimersByTime(pinLifetime - 1);
    expect(harness.layout.cardContainSizeMotion).toBe("focus");
    vi.advanceTimersByTime(1 + SETTLE_FRAMES_MS);
    expect(harness.layout.cardContainSizeMotion).toBeNull();

    harness.layout.selectSplitMode();
    expect(harness.layout.cardContainSizeMotion).toBe("return");
    vi.advanceTimersByTime(pinLifetime + SETTLE_FRAMES_MS);
    expect(harness.layout.cardContainSizeMotion).toBeNull();
  });

  it("pins Card cells through the reduced-motion dissolve settle", () => {
    vi.useFakeTimers();
    document.documentElement.dataset.motionPreference = "reduce";
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    harness.layout.selectSplitMode();
    harness.layout.selectViewerMode("card");
    expect(harness.layout.cardContainSizeMotion).toBe("focus");
    vi.advanceTimersByTime(DURATION.normal + STAGGER.normal - 1);
    expect(harness.layout.cardContainSizeMotion).toBe("focus");
    vi.advanceTimersByTime(1 + SETTLE_FRAMES_MS);
    expect(harness.layout.cardContainSizeMotion).toBeNull();

    harness.layout.selectSplitMode();
    expect(harness.layout.cardContainSizeMotion).toBe("return");
    vi.advanceTimersByTime(DURATION.normal + STAGGER.normal + SETTLE_FRAMES_MS);
    expect(harness.layout.cardContainSizeMotion).toBeNull();
  });

  it("cancels a pending pin release when another transition starts", () => {
    vi.useFakeTimers();
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    const pinLifetime = DURATION.emphasis + DURATION.normal + DURATION.emphasis;

    harness.layout.selectSplitMode();
    harness.layout.selectViewerMode("card");
    vi.advanceTimersByTime(pinLifetime);
    // The release is scheduled but has not painted yet. Returning to the split
    // now must not have its own pin cleared by the previous phase's release.
    harness.layout.selectSplitMode();
    expect(harness.layout.cardContainSizeMotion).toBe("return");
    vi.advanceTimersByTime(SETTLE_FRAMES_MS);
    expect(harness.layout.cardContainSizeMotion).toBe("return");
  });
  it("keeps the stable Card layout leased throughout a 2D focus visit", () => {
    vi.useFakeTimers();
    const resolved = {
      cols: 3,
      rows: 4,
      startPlacement: "column",
      widthUnits: 3,
      stepCount: 0,
    } satisfies ResolvedAutoLayout;
    const harness = createHarness(false, resolved);
    disposals.push(harness.dispose);

    harness.layout.rememberReadableCardAutoLayout(resolved, 581, 839);
    harness.layout.selectSplitMode();
    harness.layout.selectViewerMode("animation");

    expect(harness.layout.cardAutoLayoutOverride).toEqual(resolved);
    vi.advanceTimersByTime(DURATION.emphasis * 2);
    expect(harness.layout.cardAutoLayoutOverride).toEqual(resolved);
  });

  it("does not cancel the restored playback when the card QR opens animation", () => {
    const harness = createHarness(true);
    disposals.push(harness.dispose);

    harness.layout.selectViewerMode("card");
    harness.layout.playFromQr();

    expect(harness.viewerMode).toBe("animation");
    expect(harness.playing).toBe(true);
    expect(harness.togglePlayback).toHaveBeenCalledTimes(2);
  });

  it("opens the video workspace even when animation export was already active", () => {
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    expect(harness.exportContext).toBe("animation-export");
    harness.editMode.enterEditMode("video-upload");

    expect(harness.exportContext).toBeNull();
    expect(harness.viewerMode).toBe("videos");
    expect(harness.videoUploadOpen).toBe(true);
  });

  it("returns from the video upload panel to the video gallery", () => {
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    harness.editMode.enterEditMode("video-upload");
    harness.editMode.exitEditMode();

    expect(harness.viewerMode).toBe("videos");
    expect(harness.exportContext).toBeNull();
    expect(harness.videoUploadOpen).toBe(false);
  });

  it("opens the video gallery without leaving an export inspector active", () => {
    const harness = createHarness(false);
    disposals.push(harness.dispose);

    harness.layout.selectViewerMode("videos");

    expect(harness.viewerMode).toBe("videos");
    expect(harness.exportContext).toBeNull();
    expect(harness.videoUploadOpen).toBe(false);
  });
});
