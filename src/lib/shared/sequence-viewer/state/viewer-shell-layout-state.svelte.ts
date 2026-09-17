import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
import type { ResponsiveSettings } from "$lib/shared/device/domain/models/device-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import type { ContentType } from "./viewer-state.svelte";
import type { SelectableViewerMode } from "../services/viewer-modes";
import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
import {
  resolveExportSidebarMinWidth,
  type ViewerInspectorProfile,
} from "../services/viewer-shell-model";
import { withViewerModeDissolve } from "$lib/shared/transitions/viewer-mode-dissolve";
import { motionDuration } from "$lib/shared/transitions/motion";
import { DURATION, STAGGER } from "$lib/shared/transitions/transitions";
import { MIN_VIEWER_PANE_REVEAL_SIZE } from "../components/viewer-panel-layout";

interface ViewerShellLayoutInputs {
  getContext: () => OrchestratorContext;
  getSequence: () => SequenceData;
  getIsMobile: () => boolean;
  /**
   * The viewer is choosing recipients. Send mode keeps the stage live and
   * takes the inspector track for the recipient column, so it is an inspector
   * profile here rather than a workspace takeover.
   */
  getSendModeActive: () => boolean;
  getWorkspaceElement: () => HTMLElement | null;
  startInSplit: boolean;
  startInCardThenSplit: boolean;
}

interface ViewerShellLayoutDependencies {
  getDeviceDetector: () => DeviceDetector;
  captureScanSettingChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanSettingChanged;
  captureScanViewChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanViewChanged;
  captureScanViewerOpened: typeof import("$lib/shared/analytics/scan-analytics").captureScanViewerOpened;
  captureScanPlaybackChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanPlaybackChanged;
}

export function createViewerShellLayoutState(
  inputs: ViewerShellLayoutInputs,
  dependencies: ViewerShellLayoutDependencies
) {
  let prefersReducedMotion = $state(false);
  let bodyWidth = $state(typeof window !== "undefined" ? window.innerWidth : 0);
  let responsiveSettings = $state<ResponsiveSettings | null>(null);
  let exportSidebarCollapsed = $state(false);
  let cardAutoLayoutOverride = $state<ResolvedAutoLayout | null>(null);
  let lastReadableCardAutoLayout: ResolvedAutoLayout | null = null;
  let cardAutoLayoutReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  let cardAutoLayoutReleaseFrame = 0;
  let cardAutoLayoutReleaseSettleFrame = 0;
  let cardAutoLayoutReleaseVersion = 0;
  let cardContainSizeMotion = $state<"focus" | "return" | "restore" | null>(
    null
  );
  let cardContainSizeMotionTimer: ReturnType<typeof setTimeout> | undefined;
  let cardContainSizeMotionFrame = 0;
  let cardContainSizeMotionSettleFrame = 0;
  let cardContainSizeMotionVersion = 0;
  let cardLayoutSequenceKey = "";
  let progressivePromotionScheduled = false;

  const isMobile = $derived(inputs.getIsMobile());
  const isLandscape = $derived(responsiveSettings?.isLandscapeMobile ?? false);
  const compactChrome = $derived(isMobile || bodyWidth < 1080);
  const sendModeActive = $derived(inputs.getSendModeActive());

  const isVideoExportActive = $derived(
    inputs.getContext().editingPane === "animation"
  );
  const isImageExportActive = $derived(
    inputs.getContext().editingPane === "image"
  );
  const isVideoUploadActive = $derived(
    inputs.getContext().editingPane === "video-upload"
  );
  const isAnyExportActive = $derived(inputs.getContext().editingPane !== null);
  const isRecordSceneActive = $derived(
    isVideoExportActive &&
      inputs.getContext().renderMode === "3d" &&
      !inputs.getContext().previewBlobUrl
  );
  // Uploading a performance no longer occupies the sidebar - SequenceVideos
  // owns the uploader inside the viewer body - so it does not take the export
  // layout with it.
  const isSidebarExportActive = $derived(
    isAnyExportActive && !isRecordSceneActive && !isVideoUploadActive
  );
  const isArtInspectorActive = $derived(
    inputs.getContext().viewerState.viewerMode === "mandala" ||
      inputs.getContext().viewerState.viewerMode === "tunnel"
  );
  const showVideoGallery = $derived(
    inputs.getContext().viewerState.viewerMode === "videos" &&
      !isSidebarExportActive
  );
  // Post Studio takes the whole viewer body, the same way the video gallery
  // does. It owns its own export, so an export sidebar alongside it would be
  // two render buttons for two different files.
  const showPostStudio = $derived(
    inputs.getContext().viewerState.viewerMode === "post-studio" &&
      !isSidebarExportActive
  );

  const persistedRailWidth = $derived.by(() => {
    let storedRailWidth: string | null = null;
    try {
      storedRailWidth = localStorage.getItem("tka-viewer-rail-width");
    } catch {
      // Private browsing and locked-down embeds can deny storage. The default
      // rail width keeps the preview usable without persistence.
    }
    return storedRailWidth;
  });

  const cardExportNarrow = $derived(
    isImageExportActive &&
      !isMobile &&
      bodyWidth < resolveExportSidebarMinWidth(persistedRailWidth, "card")
  );
  const videoExportNarrow = $derived(
    isVideoExportActive &&
      !isRecordSceneActive &&
      !isMobile &&
      bodyWidth < resolveExportSidebarMinWidth(persistedRailWidth, "motion")
  );
  const artInspectorNarrow = $derived(
    isArtInspectorActive &&
      !isMobile &&
      bodyWidth < resolveExportSidebarMinWidth(persistedRailWidth, "art")
  );
  const performanceInspectorNarrow = $derived(
    showVideoGallery &&
      !isMobile &&
      bodyWidth <
        resolveExportSidebarMinWidth(persistedRailWidth, "performance")
  );
  const sendInspectorNarrow = $derived(
    sendModeActive &&
      !isMobile &&
      bodyWidth < resolveExportSidebarMinWidth(persistedRailWidth, "send")
  );
  const effectiveMobile = $derived(
    isMobile ||
      cardExportNarrow ||
      videoExportNarrow ||
      artInspectorNarrow ||
      performanceInspectorNarrow ||
      sendInspectorNarrow
  );
  // Send wins over every other inspector: the recipients are the decision
  // the viewer is making, and the stage keeps showing the view being sent.
  const inspectorProfile = $derived<ViewerInspectorProfile>(
    sendModeActive
      ? "send"
      : isImageExportActive
        ? "card"
        : isVideoExportActive
          ? "motion"
          : showVideoGallery
            ? "performance"
            : "art"
  );
  const isWorkspaceInspectorActive = $derived(
    sendModeActive ||
      isSidebarExportActive ||
      showVideoGallery ||
      (isArtInspectorActive && !effectiveMobile)
  );
  const showRail = $derived(!isMobile);
  const stackedExportWithRail = $derived(
    isSidebarExportActive && effectiveMobile && !isMobile
  );

  $effect(() => {
    void inputs.getSequence();
    exportSidebarCollapsed = false;
  });

  $effect(() => {
    const sequence = inputs.getSequence();
    // Focus/export modes can wrap the same sequence in a fresh object. Only
    // invalidate the lease when inputs that can alter the Auto grid change.
    const nextKey = `${sequence.id ?? ""}:${sequence.steps
      .map((step) => step.duration ?? 1)
      .join(",")}`;
    if (nextKey === cardLayoutSequenceKey) return;
    cardLayoutSequenceKey = nextKey;
    cardAutoLayoutOverride = null;
    lastReadableCardAutoLayout = null;
    cancelCardAutoLayoutRelease();
  });

  function cancelCardAutoLayoutRelease(): void {
    cardAutoLayoutReleaseVersion += 1;
    if (cardAutoLayoutReleaseTimer !== undefined) {
      clearTimeout(cardAutoLayoutReleaseTimer);
      cardAutoLayoutReleaseTimer = undefined;
    }
    if (cardAutoLayoutReleaseFrame) {
      cancelAnimationFrame(cardAutoLayoutReleaseFrame);
      cardAutoLayoutReleaseFrame = 0;
    }
    if (cardAutoLayoutReleaseSettleFrame) {
      cancelAnimationFrame(cardAutoLayoutReleaseSettleFrame);
      cardAutoLayoutReleaseSettleFrame = 0;
    }
  }

  function cancelCardContainSizeMotionRelease(): void {
    cardContainSizeMotionVersion += 1;
    if (cardContainSizeMotionTimer !== undefined) {
      clearTimeout(cardContainSizeMotionTimer);
      cardContainSizeMotionTimer = undefined;
    }
    if (cardContainSizeMotionFrame) {
      cancelAnimationFrame(cardContainSizeMotionFrame);
      cardContainSizeMotionFrame = 0;
    }
    if (cardContainSizeMotionSettleFrame) {
      cancelAnimationFrame(cardContainSizeMotionSettleFrame);
      cardContainSizeMotionSettleFrame = 0;
    }
  }

  function startCardContainSizeMotion(
    phase: "focus" | "return" | "restore"
  ): void {
    cancelCardContainSizeMotionRelease();
    const releaseVersion = cardContainSizeMotionVersion;

    const spatialDuration = motionDuration(DURATION.emphasis + DURATION.normal);
    // This phase is the only thing that puts a width and height transition on
    // the Card's contained box, so it has to outlive the workspace allocation
    // rather than end with the motion clock. A ResizeObserver delivery landing
    // after it would otherwise cross whatever distance is left in one
    // untransitioned frame.
    //
    // Reduced motion replaces the resize with a snapshot dissolve, but the
    // Card's internal cells still need to stay pinned until that dissolve and
    // its final ResizeObserver paints are complete.
    const lifetime =
      spatialDuration > 0
        ? spatialDuration + motionDuration(DURATION.emphasis)
        : DURATION.normal + STAGGER.normal;
    cardContainSizeMotion = phase;

    cardContainSizeMotionTimer = setTimeout(() => {
      cardContainSizeMotionTimer = undefined;
      if (releaseVersion !== cardContainSizeMotionVersion) return;
      // Two paints past the clock, so a measurement published on the frame the
      // clock expired is still carried by the transition it was measured under.
      cardContainSizeMotionFrame = requestAnimationFrame(() => {
        cardContainSizeMotionFrame = 0;
        cardContainSizeMotionSettleFrame = requestAnimationFrame(() => {
          cardContainSizeMotionSettleFrame = 0;
          if (releaseVersion !== cardContainSizeMotionVersion) return;
          cardContainSizeMotion = null;
        });
      });
    }, lifetime);
  }

  function leaseCardAutoLayout(): void {
    cancelCardAutoLayoutRelease();
    const resolved = lastReadableCardAutoLayout;
    if (resolved?.stepCount === inputs.getSequence().steps.length) {
      cardAutoLayoutOverride = { ...resolved };
    }
  }

  function rememberReadableCardAutoLayout(
    layout: ResolvedAutoLayout | null,
    width: number,
    height: number
  ): void {
    if (
      !layout ||
      layout.stepCount !== inputs.getSequence().steps.length ||
      width < MIN_VIEWER_PANE_REVEAL_SIZE ||
      height < MIN_VIEWER_PANE_REVEAL_SIZE
    ) {
      return;
    }

    lastReadableCardAutoLayout = { ...layout };
  }

  function releaseCardAutoLayoutAfterWorkspaceMotion(
    transition: ViewTransition | null
  ): void {
    cancelCardAutoLayoutRelease();
    const releaseVersion = cardAutoLayoutReleaseVersion;
    const releaseAfterSettledPaints = () => {
      if (releaseVersion !== cardAutoLayoutReleaseVersion) return;
      // ResizeObserver publishes the final split dimensions after layout. Give
      // it two paints so releasing the override cannot expose the focused
      // Card's stale measurement for a single 5×2 frame.
      cardAutoLayoutReleaseFrame = requestAnimationFrame(() => {
        cardAutoLayoutReleaseFrame = 0;
        cardAutoLayoutReleaseSettleFrame = requestAnimationFrame(() => {
          cardAutoLayoutReleaseSettleFrame = 0;
          if (releaseVersion !== cardAutoLayoutReleaseVersion) return;
          cardAutoLayoutOverride = null;
        });
      });
    };

    if (transition) {
      void transition.finished.catch(() => {}).then(releaseAfterSettledPaints);
      return;
    }

    cardAutoLayoutReleaseTimer = setTimeout(() => {
      cardAutoLayoutReleaseTimer = undefined;
      releaseAfterSettledPaints();
    }, DURATION.emphasis);
  }

  function enterSplitMode(
    ctx: OrchestratorContext,
    previousMode: string,
    track: boolean
  ): void {
    const closeInspector = () => {
      // A person leaving Card should get the playback state they arrived with.
      // Startup promotion is different: it has no prior viewing session to
      // restore and should not announce that an export was closed.
      if (track && ctx.editingPane === "image") ctx.exitEditMode();
      else ctx.viewerState.exitExport();
    };
    if (previousMode === "card") {
      startCardContainSizeMotion("return");
    }

    // The inspector and Card pane exchange the same workspace. Publishing both
    // allocations in one mutation keeps the 2D canvas on a single trajectory;
    // closing the inspector first briefly made the canvas fill the workspace
    // before the returning Card took half of it back.
    closeInspector();
    ctx.viewerState.setSplitConfig({
      leftPane: "animation",
      rightPane: "card",
    });
    ctx.viewerState.setViewerMode("split");
  }

  $effect(() => {
    const ctx = inputs.getContext();
    if (
      !inputs.startInCardThenSplit ||
      progressivePromotionScheduled ||
      !ctx.cardReady
    ) {
      return;
    }

    progressivePromotionScheduled = true;
    let secondFrame = 0;
    let promotionTimer: ReturnType<typeof setTimeout> | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        // The card receives its stable painted frame before animation services
        // activate and Side-by-Side replaces the first impression.
        promotionTimer = setTimeout(() => selectSplitMode(false), 0);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (promotionTimer !== undefined) clearTimeout(promotionTimer);
    };
  });

  function mount(): () => void {
    const cleanups: Array<() => void> = [];
    const mediaQuery = matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion = mediaQuery.matches;
    const onReduceChange = () => (prefersReducedMotion = mediaQuery.matches);
    mediaQuery.addEventListener("change", onReduceChange);
    cleanups.push(() =>
      mediaQuery.removeEventListener("change", onReduceChange)
    );

    try {
      const deviceDetector = dependencies.getDeviceDetector();
      responsiveSettings = deviceDetector.getResponsiveSettings();
      cleanups.push(
        deviceDetector.onCapabilitiesChanged(() => {
          responsiveSettings = deviceDetector.getResponsiveSettings();
        })
      );
    } catch (error) {
      console.warn(
        "SequenceViewerShell: Failed to resolve DeviceDetector",
        error
      );
    }

    const ctx = inputs.getContext();
    if (inputs.startInCardThenSplit) {
      dependencies.captureScanViewerOpened("card");
    } else if (inputs.startInSplit) {
      queueMicrotask(() => {
        selectSplitMode(false);
        dependencies.captureScanViewerOpened("split");
      });
    } else {
      dependencies.captureScanViewerOpened(ctx.viewerState.viewerMode);
    }

    return () => {
      cancelCardAutoLayoutRelease();
      cancelCardContainSizeMotionRelease();
      for (const cleanup of cleanups) cleanup();
    };
  }

  function toggleExportSidebar(): void {
    const previous = !exportSidebarCollapsed;
    exportSidebarCollapsed = !exportSidebarCollapsed;
    dependencies.captureScanSettingChanged({
      group: "export",
      setting: "settings_visible",
      previous_value: previous,
      value: !exportSidebarCollapsed,
      source: "header",
    });
  }

  function selectSplitMode(track = true): void {
    const ctx = inputs.getContext();
    ctx.ensureInteractiveServices();
    const previousMode = ctx.viewerState.viewerMode;
    if (
      (previousMode === "card" || previousMode === "animation") &&
      !cardAutoLayoutOverride
    ) {
      leaseCardAutoLayout();
    }
    const transition = withViewerModeDissolve(
      inputs.getWorkspaceElement(),
      previousMode,
      "split",
      () => {
        enterSplitMode(ctx, previousMode, track);
      }
    );
    if (previousMode === "card" || previousMode === "animation") {
      releaseCardAutoLayoutAfterWorkspaceMotion(transition);
    }
    if (track) {
      dependencies.captureScanViewChanged(
        previousMode,
        "split",
        "mode_switcher"
      );
    }
  }

  function selectViewerMode(
    mode: SelectableViewerMode,
    countIntent = true
  ): void {
    const ctx = inputs.getContext();
    const previousMode = ctx.viewerState.viewerMode;
    if (previousMode === mode) return;
    if (previousMode !== "card" && mode === "card") {
      // Side-by-Side gives the Card a readable starting box that can grow into
      // focus. A motion mode leaves the mounted Card behind a zero-sized track;
      // restore the last readable box instead of recalculating it through that
      // sliver and briefly painting a pencil-thin Card.
      startCardContainSizeMotion(
        previousMode === "split" ? "focus" : "restore"
      );
    } else if (previousMode === "card" && mode !== "card") {
      startCardContainSizeMotion("return");
    }
    if (mode !== "card") ctx.ensureInteractiveServices();
    // Entering Card does not lease. The Card solves its grid against the box
    // its pane is heading toward, so there is no sliver for the picker to
    // choose a wide, shallow grid from -- and a lease here would pin the
    // Side-by-Side grid onto the focused Card for the whole visit.
    if (previousMode === "split" && mode === "animation") {
      // The covered Card still owns the last readable Side-by-Side shape.
      // Holding it across the 2D visit prevents an interrupted return from
      // publishing a pencil-thin Auto grid before Card focus takes over.
      leaseCardAutoLayout();
    } else if (previousMode === "card" && !cardAutoLayoutOverride) {
      leaseCardAutoLayout();
    }

    const transition = withViewerModeDissolve(
      inputs.getWorkspaceElement(),
      previousMode,
      mode,
      () => {
        if (mode === "animation") {
          if (ctx.editingPane === "image") ctx.exitEditMode();
          ctx.viewerState.enterExport("animation-export", "animation");
        } else if (mode === "animation-3d") {
          if (ctx.editingPane === "image") ctx.exitEditMode();
          ctx.viewerState.enterExport("animation-export", "animation-3d");
        } else if (mode === "card") {
          ctx.enterEditMode("image");
        } else if (mode === "videos") {
          // Performances has its own stage and inspector contents. Close the
          // previous editor state so both persistent tracks can change from
          // the same viewer-mode commit.
          if (ctx.editingPane) ctx.exitEditMode();
          else ctx.viewerState.exitExport();
          ctx.viewerState.setViewerMode(mode);
        } else if (mode === "mandala" || mode === "tunnel") {
          if (ctx.editingPane === "image") ctx.exitEditMode();
          else ctx.viewerState.exitExport();
          ctx.viewerState.setViewerMode(mode);
        } else if (mode === "post-studio") {
          // Same shape as the gallery: the studio owns the whole viewer body and
          // its own render, so any open inspector has to close before it appears.
          if (ctx.editingPane) ctx.exitEditMode();
          else ctx.viewerState.exitExport();
          ctx.viewerState.setViewerMode(mode);
        }
      }
    );
    if (previousMode === "card" && mode !== "card") {
      releaseCardAutoLayoutAfterWorkspaceMotion(transition);
    }
    dependencies.captureScanViewChanged(previousMode, mode, "mode_switcher", {
      count: countIntent,
    });
  }

  function playFromQr(): void {
    const ctx = inputs.getContext();
    const wasPlaying = ctx.isPlayingLocal;
    selectViewerMode("animation", false);
    if (!inputs.getContext().isPlayingLocal) ctx.handlePlaybackToggle();
    dependencies.captureScanPlaybackChanged({
      action: "qr_play",
      previous_value: wasPlaying,
      value: true,
      source: "card_qr_badge",
      bpm: ctx.bpmLocal,
    });
  }

  return {
    get prefersReducedMotion() {
      return prefersReducedMotion;
    },
    get bodyWidth() {
      return bodyWidth;
    },
    set bodyWidth(value: number) {
      bodyWidth = value;
    },
    get isLandscape() {
      return isLandscape;
    },
    get compactChrome() {
      return compactChrome;
    },
    get exportSidebarCollapsed() {
      return exportSidebarCollapsed;
    },
    get cardAutoLayoutOverride() {
      return cardAutoLayoutOverride;
    },
    get cardContainSizeMotion() {
      return cardContainSizeMotion;
    },
    rememberReadableCardAutoLayout,
    get isVideoExportActive() {
      return isVideoExportActive;
    },
    get isImageExportActive() {
      return isImageExportActive;
    },
    get isVideoUploadActive() {
      return isVideoUploadActive;
    },
    get isAnyExportActive() {
      return isAnyExportActive;
    },
    get isRecordSceneActive() {
      return isRecordSceneActive;
    },
    get isSidebarExportActive() {
      return isSidebarExportActive;
    },
    get isArtInspectorActive() {
      return isArtInspectorActive;
    },
    get isWorkspaceInspectorActive() {
      return isWorkspaceInspectorActive;
    },
    get showVideoGallery() {
      return showVideoGallery;
    },
    get showPostStudio() {
      return showPostStudio;
    },
    get effectiveMobile() {
      return effectiveMobile;
    },
    get inspectorProfile() {
      return inspectorProfile;
    },
    get showRail() {
      return showRail;
    },
    get stackedExportWithRail() {
      return stackedExportWithRail;
    },
    mount,
    toggleExportSidebar,
    selectSplitMode,
    selectViewerMode,
    playFromQr,
  };
}
