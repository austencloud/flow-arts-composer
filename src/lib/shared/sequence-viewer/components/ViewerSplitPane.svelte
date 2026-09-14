<!--
  ViewerSplitPane owns split geometry and shared rendering contexts. Individual
  surfaces own their own lazy mounting, keep-alive, and practice behavior.
-->
<script lang="ts">
  import { TrackingMode } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import {
    getScene3DRenderContext,
    setScene3DRenderContext,
  } from "$lib/shared/3d/scene-features/state/scene-3d-render-context";
  import { createScene3DRenderState } from "$lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";
  import { startSceneAssetPreload } from "$lib/shared/3d/services/scene-asset-preloader.svelte";
  import { foldTrailIntentIntoSettings } from "$lib/shared/effects/translators/canvas2d-translator";
  import {
    getEffectsConfigContext,
    setEffectsConfigContext,
  } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  import { isBilateralProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import ViewerCompanionSurface from "./ViewerCompanionSurface.svelte";
  import ViewerMotionSurface from "./ViewerMotionSurface.svelte";
  import ViewerPracticeLane from "./ViewerPracticeLane.svelte";
  import PracticeCountInOverlay from "./PracticeCountInOverlay.svelte";
  import {
    MIN_VIEWER_PANE_REVEAL_SIZE,
    readViewerCardPaneBox,
    rememberViewerCardPaneBox,
    resolveViewerPanelDirection,
    resolveViewerPanelLayout,
    resolveViewerPaneDestinationBox,
    resolveViewerPaneRevealReady,
    type ViewerFocusedPane,
    type ViewerPanelDirection,
  } from "./viewer-panel-layout";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type { ViewerSplitPaneProps } from "./viewer-split-pane-types";
  import { VIEWER_INSPECTOR_HANDLE_SIZE as VIEWER_SPLIT_HANDLE_SIZE } from "../services/viewer-shell-model";
  import { onDestroy } from "svelte";
  import { TunnelViewController } from "../tunnel/tunnel-view-controller.svelte";
  import { TUNNEL_REVEAL_DURATION } from "../tunnel/tunnel-layer-reveal";
  import type { TunnelViewState } from "../tunnel/tunnel-view-state";
  import { tryGetViewerUrlSessionContext } from "../services/viewer-url-session";
  import {
    captureTnSlice,
    persistedTnSliceFromStorage,
    seedFromTnSlice,
    type TnSlicePayload,
  } from "../services/viewer-url-slices/tn-slice";
  import { createViewerTunnelStageState } from "../state/viewer-tunnel-stage-state.svelte";
  import { setViewerTunnelStageContext } from "../context/viewer-tunnel-stage-context";
  import {
    VIEWER_SPLIT_DEFAULT_SHARE,
    VIEWER_SPLIT_MIN_SHARE,
    loadViewerSplitShares,
    saveViewerSplitShares,
    viewerSplitShareFromSizes,
  } from "./viewer-split-prefs";
  import "./viewer-split-pane.css";

  let {
    sequence,
    playback,
    imageComposition,
    propRendering,
    layout,
    bpm = 60,
    onBpmChange = () => {},
    onSaveToLibrary,
    onPropChange,
    onFanAppearanceChange,
    onRenderProgress,
    onUnfocusPane,
    onStepClick,
    onQrPlayClick,
    onCanvasReady,
    rendererHandleRequired = false,
    onChoreoCardContextMenu,
    cardAutoLayoutOverride,
    cardContainSizeMotion = null,
    onAutoLayoutResolved,
    onPlaybackToggle,
    onSystemPlaybackChange,
    onProgressBarSeek,
    onProgressBarScrubStart,
    onProgressBarScrubEnd,
    playbackMode,
    onPlaybackModeChange,
    onSceneReadyChange,
    rerenderTrigger = 0,
    splitConfig = { leftPane: "animation", rightPane: "card" },
    isLoggedIn = false,
    onVideoUpload,
    onArtExport,
    onArtShare,
    artShareActive = false,
    onArtExportEvent,
    onArtSettingChange,
    onArtAction,
    onViewer3DSettingChange,
    onViewer3DAction,
    suppressProgress = false,
    practiceActive = false,
    practiceCellSize = 72,
    practiceCanvasFraction = 0.38,
    practiceRunning = false,
    practiceCountdown = 0,
    practiceMirrorEnabled = false,
    tunnelComposition = null,
    tunnelSaveTarget = null,
    onTunnelSaved,
  }: ViewerSplitPaneProps = $props();

  // ── tn URL slice ─────────────────────────────────────────────────────────
  // This split pane now owns THE shared tunnel controller (adopted by ArtPane
  // and the persistent 2D canvas alike), so the seed and the live capture both
  // belong here — one construction site, one `registerSlice("tn")` owner. See
  // tn-slice.ts for the pure instance seam and the preset-by-value contract.
  const viewerUrlSession = tryGetViewerUrlSessionContext();
  const tnSeedPayload =
    (viewerUrlSession?.getSeed("tn") as TnSlicePayload | null) ?? null;
  // Own-link rule in slice space, both sides through captureTnSlice: a link
  // that matches what this visitor's own disk would load is not an override,
  // so this pane keeps reading/writing localStorage normally.
  const tnSeed: TunnelViewState | null =
    tnSeedPayload &&
    viewerUrlSession?.isOverride("tn", persistedTnSliceFromStorage())
      ? seedFromTnSlice(tnSeedPayload)
      : null;

  // The tunnel's controls, renderer, and export path all steer this one
  // controller. Keeping it above both pane surfaces lets the already-mounted 2D
  // canvas adopt the tunnel without growing a second controller or render loop.
  const tunnelController = new TunnelViewController({
    getSequence: () => playback.animationState.sequenceData ?? sequence,
    getComposition: () => tunnelComposition,
    // The base pair and Tunnel copies occupy one persistent Animator canvas.
    // Give both settings panels the same visibility owner so a Grid change is
    // a canvas preference, not a mode-local value copied during a switch.
    visibilityManager: getAnimationVisibilityManager(),
    // 2D and Tunnel share this canvas. Keep its formation prepared while 2D is
    // showing so a quick return can reverse the live reveal with no rebuild.
    prepareWhileInactive: true,
    ...(tnSeed ? { initialViewState: tnSeed, persistViewState: false } : {}),
  });
  const tunnelStage = createViewerTunnelStageState(tunnelController);
  setViewerTunnelStageContext(tunnelStage);

  const captureTn = (options: { full?: boolean } = {}) =>
    captureTnSlice(tunnelController, options);
  if (viewerUrlSession) {
    onDestroy(viewerUrlSession.registerSlice("tn", captureTn));
    // The orchestrator never constructs tunnel state, so nothing upstream can
    // track this controller's fields and re-run on them. This pane-side effect
    // does that tracking and asks the session to write — the same gap-closer
    // t3 uses in Viewer3DCanvas for its own lazily-mounted pane state.
    $effect(() => {
      void captureTn();
      viewerUrlSession.scheduleUrlWrite();
    });
  }

  // Both canvas renderers share one effects state, inherited from the
  // orchestrator — which is what makes a URL-seeded view-only (persist:false)
  // effects store reach every surface instead of being shadowed here. All three
  // shell hosts (drawer, /sequence route, /from/spiroanim) mount inside
  // SequenceViewerOrchestrator, so the local fallback below is unreachable
  // while a URL session is live. Never construct an effects store in this
  // subtree without going through the context, or link state leaks to disk.
  const inheritedEffectsConfig = getEffectsConfigContext();
  const effectsConfigState =
    inheritedEffectsConfig ?? createEffectsConfigState();
  if (!inheritedEffectsConfig) {
    setEffectsConfigContext(effectsConfigState);
  }

  const inheritedScene3DRender = getScene3DRenderContext();
  if (!inheritedScene3DRender) {
    setScene3DRenderContext(createScene3DRenderState());
  }

  const trailSettings = $derived.by(() => {
    const animationTrail = animationSettings.trail;
    void animationTrail.mode;
    void animationTrail.fadeDurationMs;
    void animationTrail.trackingMode;
    void animationTrail.effect;
    void animationTrail.tailLength;

    const trailIntent = effectsConfigState.trails;
    void trailIntent.thickness;
    void trailIntent.brightness;
    void trailIntent.leftColor;
    void trailIntent.rightColor;

    const settings = foldTrailIntentIntoSettings(animationTrail, trailIntent);
    if (settings.trackingMode === TrackingMode.BOTH_ENDS) {
      const left = propRendering.leftPropType;
      const right = propRendering.rightPropType;
      const hasBilateral =
        (left != null && isBilateralProp(String(left))) ||
        (right != null && isBilateralProp(String(right)));
      if (!hasBilateral) settings.trackingMode = TrackingMode.RIGHT_END;
    }

    return settings;
  });

  let splitWidth = $state(
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  let splitHeight = $state(
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  let animationPanelWidth = $state(0);
  let animationPanelHeight = $state(0);
  let previewPanelWidth = $state(0);
  let previewPanelHeight = $state(0);
  let animationPanelReady = $state(false);
  let previewPanelReady = $state(false);
  const viewerFocusedPane = $derived<"animation" | "image" | null>(
    layout.focusedPane === "animation" || layout.focusedPane === "image"
      ? layout.focusedPane
      : null
  );
  const adaptiveVerticalSplit = $derived(
    !practiceActive &&
      layout.focusedPane === null &&
      !layout.isMobile &&
      !layout.isFullscreen &&
      splitHeight > splitWidth
  );
  // The user's Side by Side split, one share per axis, remembered per device.
  // The divider only exists on desktop while both panes are readable; focus
  // and Practice keep their own allocations.
  let userSplitShares = $state(loadViewerSplitShares());
  const splitResizable = $derived(
    !layout.isMobile && !practiceActive && viewerFocusedPane === null
  );
  const responsivePanelLayout = $derived(
    resolveViewerPanelLayout({
      isFullscreen: layout.isFullscreen,
      fullscreenStackVertical: layout.fullscreenStackVertical,
      isMobile: layout.isMobile,
      isLandscapeMobile: layout.isLandscapeMobile,
      adaptiveVerticalSplit,
      focusedPane: viewerFocusedPane,
      practiceActive,
      practiceCanvasFraction,
      userSplitShares: splitResizable ? userSplitShares : undefined,
    })
  );
  function handleSplitSizesChange(sizes: number[]): void {
    const direction = panelLayout.direction;
    const next = {
      ...userSplitShares,
      [direction]: viewerSplitShareFromSizes(sizes),
    };
    userSplitShares = next;
    saveViewerSplitShares(next);
  }
  function resetSplitShare(): void {
    const next = {
      ...userSplitShares,
      [panelLayout.direction]: VIEWER_SPLIT_DEFAULT_SHARE,
    };
    userSplitShares = next;
    saveViewerSplitShares(next);
  }
  // Each pane keeps at least a quarter of the axis and the readable minimum.
  const splitAxisLength = $derived(
    panelLayout.direction === "horizontal" ? splitWidth : splitHeight
  );
  const splitPaneMinSize = $derived(
    Math.max(
      MIN_VIEWER_PANE_REVEAL_SIZE,
      splitAxisLength * VIEWER_SPLIT_MIN_SHARE
    )
  );
  let retainedSplitDirection = $state<ViewerPanelDirection | null>(null);
  let focusReleasePending = $state(false);
  let previousFocusedPane: ViewerFocusedPane = viewerFocusedPane;
  let directionReleaseTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const focusedPane = viewerFocusedPane;
    const responsiveDirection = responsivePanelLayout.direction;

    if (practiceActive) {
      clearTimeout(directionReleaseTimer);
      directionReleaseTimer = undefined;
      focusReleasePending = false;
      retainedSplitDirection = responsiveDirection;
    } else if (retainedSplitDirection === null) {
      retainedSplitDirection = responsiveDirection;
    }

    if (!practiceActive && focusedPane !== null) {
      clearTimeout(directionReleaseTimer);
      directionReleaseTimer = undefined;
      focusReleasePending = false;
    } else if (
      !practiceActive &&
      previousFocusedPane !== null &&
      focusedPane === null
    ) {
      clearTimeout(directionReleaseTimer);
      const duration = motionDuration(DURATION.emphasis);
      focusReleasePending = duration > 0;
      if (duration > 0) {
        directionReleaseTimer = setTimeout(() => {
          directionReleaseTimer = undefined;
          focusReleasePending = false;
        }, duration);
      }
    } else if (!practiceActive && !focusReleasePending) {
      retainedSplitDirection = responsiveDirection;
    }

    previousFocusedPane = focusedPane;
  });

  $effect(() => () => clearTimeout(directionReleaseTimer));

  const panelDirection = $derived(
    resolveViewerPanelDirection({
      responsiveDirection: responsivePanelLayout.direction,
      retainedSplitDirection,
      focusedPane: practiceActive ? null : viewerFocusedPane,
      focusReleasePending: !practiceActive && focusReleasePending,
    })
  );
  const panelLayout = $derived({
    ...responsivePanelLayout,
    direction: panelDirection,
  });
  $effect.pre(() => {
    // Clear the covered pane's bound measurements before focus is released.
    // Its first split-mode measurement is therefore guaranteed to be fresh,
    // rather than the large value it had before the focus transition began.
    if (viewerFocusedPane === "image") {
      animationPanelWidth = 0;
      animationPanelHeight = 0;
    } else if (viewerFocusedPane === "animation") {
      previewPanelWidth = 0;
      previewPanelHeight = 0;
    }
  });
  /**
   * The box the Card's pane occupies right now, from the split's own measured
   * size and the allocation the layout has decided.
   */
  const liveCardPaneBox = $derived(
    resolveViewerPaneDestinationBox({
      pane: "image",
      direction: panelLayout.direction,
      sizes: panelLayout.sizes,
      splitWidth,
      splitHeight,
    })
  );

  /**
   * The box the Card's pane is heading toward, remembered from the last frame
   * this layout settled at this viewport.
   *
   * Nothing about the pane's live geometry describes its destination during a
   * mode change: its flex allocation animates from nothing, and the split it
   * sits in resizes at the same time as the dock collapses. Two boxes matter
   * to the Card -- the one a focused mode gives it and the one side-by-side
   * gives it, which differ on narrow screens -- and modes that replace the
   * Card entirely give it a third that must never be taught here.
   *
   * `suppressCloseButton` is set for every focused mode and clear for
   * side-by-side, which is exactly that distinction.
   *
   * The panel direction is deliberately not part of the key. A box is already
   * a width and a height, so direction adds nothing a settled measurement does
   * not carry -- and it resolves a frame or two behind the mode change, which
   * would miss the lookup on exactly the entries that need it.
   */
  const cardPaneBoxKey = $derived(
    layout.suppressCloseButton ? "focus" : "split"
  );

  /**
   * Only a layout that actually shows the Card may teach its destination.
   *
   * Tunnel focuses the same pane the Card does but keeps the dock open, so its
   * stage is some hundreds of pixels narrower. Letting it write the focused
   * box would teach the Card a size it never occupies.
   */
  const cardIsSelectedCompanion = $derived(
    splitConfig.leftPane === "card" || splitConfig.rightPane === "card"
  );

  /**
   * How long a pane box must hold still before it counts as settled.
   *
   * The motion flag clears while the pane is still easing open, so a frame
   * taken the moment it drops is a mid-animation size. No opening frame
   * survives this long at one size; a real layout change does.
   */
  const PANE_BOX_SETTLE_MS = 180;

  let paneBoxSettleTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const box = cardContainSizeMotion === null ? liveCardPaneBox : null;
    const eligible =
      box !== null &&
      cardIsSelectedCompanion &&
      layout.focusedPane !== "animation";
    const key = cardPaneBoxKey;
    if (paneBoxSettleTimer !== null) clearTimeout(paneBoxSettleTimer);
    if (!eligible) return;
    paneBoxSettleTimer = setTimeout(() => {
      paneBoxSettleTimer = null;
      rememberViewerCardPaneBox(
        key,
        window.innerWidth,
        window.innerHeight,
        box
      );
    }, PANE_BOX_SETTLE_MS);
    return () => {
      if (paneBoxSettleTimer !== null) clearTimeout(paneBoxSettleTimer);
      paneBoxSettleTimer = null;
    };
  });

  const cardContainMotionBox = $derived.by(() => {
    const remembered = readViewerCardPaneBox(
      cardPaneBoxKey,
      window.innerWidth,
      window.innerHeight
    );
    // Before this layout has settled once at this viewport there is nothing to
    // remember. Publishing no destination is better than publishing the box
    // the Card is leaving: that one makes it solve a grid for the wrong shape
    // and correct in public. Let the ordinary measurement path carry the first
    // entry instead.
    if (remembered === null) return liveCardPaneBox;
    if (cardContainSizeMotion !== null) return remembered;
    if (liveCardPaneBox === null) return remembered;
    // A pane measurably smaller than the one this layout settled at is still
    // opening, whatever the motion flag says. The incoming Card can mount a
    // frame before the flag is set, and a sliver read as a settled measurement
    // is what makes it solve for a speck and then grow.
    const stillOpening =
      liveCardPaneBox.width < remembered.width * 0.98 ||
      liveCardPaneBox.height < remembered.height * 0.98;
    return stillOpening ? remembered : liveCardPaneBox;
  });

  $effect(() => {
    animationPanelReady = resolveViewerPaneRevealReady({
      pane: "animation",
      focusedPane: viewerFocusedPane,
      direction: panelLayout.direction,
      width: animationPanelWidth,
      height: animationPanelHeight,
      stageWidth: splitWidth,
      stageHeight: splitHeight,
    });
    previewPanelReady = resolveViewerPaneRevealReady({
      pane: "image",
      focusedPane: viewerFocusedPane,
      direction: panelLayout.direction,
      width: previewPanelWidth,
      height: previewPanelHeight,
      stageWidth: splitWidth,
      stageHeight: splitHeight,
    });
  });

  // During the practice layout glide, CSS scales the current canvas buffer.
  // Resume rasterization once the 300ms workspace transition has settled.
  let practiceResizePaused = $state(false);
  let previousPracticeActive = practiceActive;
  let resizeResumeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const active = practiceActive;
    if (active === previousPracticeActive) return;
    previousPracticeActive = active;
    const reduceMotion =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    practiceResizePaused = true;
    clearTimeout(resizeResumeTimer);
    resizeResumeTimer = setTimeout(() => (practiceResizePaused = false), 340);
  });
  $effect(() => () => clearTimeout(resizeResumeTimer));

  const needs3D = $derived(
    splitConfig.leftPane === "animation-3d" ||
      splitConfig.rightPane === "animation-3d"
  );
  $effect(() => {
    if (needs3D) startSceneAssetPreload();
  });
  const needsTunnel = $derived(
    splitConfig.leftPane === "tunnel" || splitConfig.rightPane === "tunnel"
  );
  let tunnelReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    clearTimeout(tunnelReleaseTimer);
    tunnelReleaseTimer = undefined;

    if (needsTunnel) {
      tunnelController.active = true;
      return;
    }

    const releaseDelay = motionDuration(TUNNEL_REVEAL_DURATION);
    if (releaseDelay === 0) {
      tunnelController.active = false;
      return;
    }

    // The shared canvas fades its tunnel layers away after the mode changes.
    // Keep the controller's rendered layers alive for that final envelope so
    // leaving Tunnel never collapses into an abrupt one-frame disappearance.
    tunnelReleaseTimer = setTimeout(() => {
      tunnelReleaseTimer = undefined;
      tunnelController.active = false;
    }, releaseDelay);
  });
  $effect(() => () => clearTimeout(tunnelReleaseTimer));
</script>

{#snippet animationPanel()}
  <div
    class="split-column animation-column"
    class:focused={layout.focusedPane === "animation"}
    data-hidden={layout.focusedPane === "image"}
    data-readable={animationPanelReady}
    inert={layout.focusedPane === "image" || !animationPanelReady}
    aria-hidden={layout.focusedPane === "image" || !animationPanelReady}
    bind:clientWidth={animationPanelWidth}
    bind:clientHeight={animationPanelHeight}
  >
    <ViewerMotionSurface
      side="left"
      {sequence}
      {playback}
      {propRendering}
      {layout}
      {splitConfig}
      {trailSettings}
      {bpm}
      {onBpmChange}
      {onSaveToLibrary}
      {onUnfocusPane}
      {onCanvasReady}
      {rendererHandleRequired}
      {onPlaybackToggle}
      {onSystemPlaybackChange}
      {onProgressBarSeek}
      {onProgressBarScrubStart}
      {onProgressBarScrubEnd}
      {playbackMode}
      {onPlaybackModeChange}
      {onSceneReadyChange}
      {onViewer3DSettingChange}
      {onViewer3DAction}
      {suppressProgress}
      {practiceActive}
      {practiceMirrorEnabled}
      {practiceResizePaused}
    />
    <ViewerCompanionSurface
      side="left"
      {sequence}
      {playback}
      {imageComposition}
      {propRendering}
      {layout}
      {splitConfig}
      {bpm}
      {onBpmChange}
      {onSaveToLibrary}
      {onPropChange}
      {onFanAppearanceChange}
      {onRenderProgress}
      {onUnfocusPane}
      {onStepClick}
      {onQrPlayClick}
      {onChoreoCardContextMenu}
      {cardAutoLayoutOverride}
      {cardContainSizeMotion}
      {cardContainMotionBox}
      {onAutoLayoutResolved}
      {onPlaybackToggle}
      {playbackMode}
      {onPlaybackModeChange}
      {rerenderTrigger}
      {isLoggedIn}
      {onVideoUpload}
      {onArtExport}
      {onArtShare}
      {artShareActive}
      {onArtExportEvent}
      {onArtSettingChange}
      {onArtAction}
      {tunnelComposition}
      {tunnelSaveTarget}
      {onTunnelSaved}
    />
    <PracticeCountInOverlay count={practiceCountdown} />
  </div>
{/snippet}

{#snippet previewPanel()}
  <div
    class="split-column preview-column"
    class:focused={layout.focusedPane === "image"}
    data-hidden={layout.focusedPane === "animation"}
    data-readable={previewPanelReady}
    inert={layout.focusedPane === "animation" || !previewPanelReady}
    aria-hidden={layout.focusedPane === "animation" || !previewPanelReady}
    bind:clientWidth={previewPanelWidth}
    bind:clientHeight={previewPanelHeight}
  >
    <div
      class="preview-column-inner"
      class:focused={layout.focusedPane === "image"}
    >
      <ViewerMotionSurface
        side="right"
        {sequence}
        {playback}
        {propRendering}
        {layout}
        {splitConfig}
        {trailSettings}
        {bpm}
        {onBpmChange}
        {onSaveToLibrary}
        {onUnfocusPane}
        {onCanvasReady}
        {rendererHandleRequired}
        {onPlaybackToggle}
        {onSystemPlaybackChange}
        {onProgressBarSeek}
        {onProgressBarScrubStart}
        {onProgressBarScrubEnd}
        {playbackMode}
        {onPlaybackModeChange}
        {onSceneReadyChange}
        {onViewer3DSettingChange}
        {onViewer3DAction}
        {suppressProgress}
        {practiceActive}
        {practiceMirrorEnabled}
        {practiceResizePaused}
      />
      <ViewerCompanionSurface
        side="right"
        {sequence}
        {playback}
        {imageComposition}
        {propRendering}
        {layout}
        {splitConfig}
        {bpm}
        {onBpmChange}
        {onSaveToLibrary}
        {onPropChange}
        {onFanAppearanceChange}
        {onRenderProgress}
        {onUnfocusPane}
        {onStepClick}
        {onQrPlayClick}
        {onChoreoCardContextMenu}
        {cardAutoLayoutOverride}
        {cardContainSizeMotion}
        {cardContainMotionBox}
        {onAutoLayoutResolved}
        {onPlaybackToggle}
        {playbackMode}
        {onPlaybackModeChange}
        {rerenderTrigger}
        {isLoggedIn}
        {onVideoUpload}
        {onArtExport}
        {onArtShare}
        {artShareActive}
        {onArtExportEvent}
        {onArtSettingChange}
        {onArtAction}
        {tunnelComposition}
        {tunnelSaveTarget}
        {onTunnelSaved}
      />
      {#if practiceActive}
        <ViewerPracticeLane
          {playback}
          {propRendering}
          {bpm}
          cellSize={practiceCellSize}
          running={practiceRunning}
          countdown={practiceCountdown}
          onSeek={onProgressBarSeek}
        />
      {/if}
    </div>
  </div>
{/snippet}

<div
  class="split-view view-container"
  class:practice={practiceActive}
  bind:clientWidth={splitWidth}
  bind:clientHeight={splitHeight}
  data-panel-direction={panelLayout.direction}
  data-focused={layout.focusedPane}
>
  <PanelGroup
    direction={panelLayout.direction}
    sizes={panelLayout.sizes}
    gap={splitResizable ? VIEWER_SPLIT_HANDLE_SIZE : 0}
    onSizesChange={handleSplitSizesChange}
    onHandleDoubleClick={resetSplitShare}
    panels={[
      {
        id: "animation",
        content: animationPanel,
        resizable: splitResizable,
        minSize: splitPaneMinSize,
        resizeLabel: "Resize animation and card",
      },
      {
        id: "preview",
        content: previewPanel,
        resizable: false,
        minSize: splitPaneMinSize,
        preferredSize: panelLayout.previewPreferredSize,
      },
    ]}
  />
</div>
