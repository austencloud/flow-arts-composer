<script lang="ts">
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { getViewerStudioSurfaces } from "../context/viewer-studio-surfaces-context";
  import {
    reparentToInspector,
    type ReparentOptions,
  } from "./reparent-to-inspector";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import CameraPreview from "$lib/shared/train/components/CameraPreview.svelte";
  import type { ViewerMotionSurfaceProps } from "./viewer-split-pane-types";
  import SceneControlWorkspace from "$lib/shared/3d/components/controls/SceneControlWorkspace.svelte";
  import type { SceneControlLayout } from "$lib/shared/3d/domain/scene-control-layout";
  import ContactViewerRequired from "$lib/shared/3d/components/ContactViewerRequired.svelte";
  import ScenePreparationSurface from "$lib/shared/3d/scene-features/components/ScenePreparationSurface.svelte";
  import { sceneNeedsContactViewer } from "$lib/shared/3d/domain/prop-motion-discipline";
  import VisualSequenceSaveContextMenuHost from "$lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";
  import Viewer3DRailHint from "$lib/shared/3d/components/onboarding/Viewer3DRailHint.svelte";
  import { warmSelectedSceneAssets } from "$lib/shared/3d/scene-boot/scene-prefetch";
  import {
    isViewer3DIntroReplayRequested,
    shouldShowViewer3DIntro,
  } from "$lib/shared/onboarding/state/viewer3d-intro-state";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { getViewerTunnelStageContext } from "../context/viewer-tunnel-stage-context";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import {
    resolveTunnelGridOpacity,
    resolveTunnelLayerOpacity,
    tunnelLayerPoseDifference,
    TUNNEL_REVEAL_DURATION,
  } from "../tunnel/tunnel-layer-reveal";
  import type { AdditionalLayerTextureStatus } from "$lib/shared/animation-engine/services/animation-engine.svelte";

  let {
    side,
    sequence,
    playback,
    propRendering,
    layout,
    splitConfig,
    trailSettings,
    bpm,
    onBpmChange,
    onSaveToLibrary,
    onUnfocusPane,
    onCanvasReady,
    rendererHandleRequired,
    onPlaybackToggle,
    onSystemPlaybackChange,
    onProgressBarSeek,
    onProgressBarScrubStart,
    onProgressBarScrubEnd,
    playbackMode,
    onPlaybackModeChange,
    onSceneReadyChange,
    onViewer3DSettingChange,
    onViewer3DAction,
    suppressProgress,
    practiceActive,
    practiceMirrorEnabled,
    practiceResizePaused,
  }: ViewerMotionSurfaceProps = $props();

  const selectedPane = $derived(
    side === "left" ? splitConfig.leftPane : splitConfig.rightPane
  );
  const studioSurfaces = getViewerStudioSurfaces();
  const studioFrame = $derived(side === "left" ? studioSurfaces?.frame : null);
  const inStudio = $derived(side === "left" && !!studioSurfaces?.canvasTarget);
  let canvasHandoff: ReturnType<typeof reparentToInspector> | undefined;
  $effect.pre(() => {
    // The transport may move before the phone destination mounts. Capture the
    // visual canvas before either sibling changes the layout, not at docking.
    void studioSurfaces?.active;
    canvasHandoff?.capture();
  });
  function ownCanvas(node: HTMLElement, options: ReparentOptions) {
    const unregister =
      side === "left" ? studioSurfaces?.registerCanvas(node) : undefined;
    const handoff = reparentToInspector(node, options);
    canvasHandoff = handoff;
    return {
      update: handoff.update,
      destroy: () => {
        handoff.destroy();
        unregister?.();
        if (canvasHandoff === handoff) canvasHandoff = undefined;
      },
    };
  }
  const is2DActive = $derived(selectedPane === "animation");
  const is3DActive = $derived(selectedPane === "animation-3d");
  const isTunnelActive = $derived(selectedPane === "tunnel");
  const isAnimatorActive = $derived(is2DActive || isTunnelActive);
  const tunnelStage = getViewerTunnelStageContext();
  const tunnelController = tunnelStage.controller;
  const effectsConfig = getEffectsConfigContext();
  const requiresContactViewer = $derived(
    sceneNeedsContactViewer(
      propRendering.leftPropType,
      propRendering.rightPropType
    )
  );

  // Both 2D canvases and the primary 3D stage are keep-alive surfaces. The
  // companion-side 3D stage preserves its prior conditional-mount contract.
  let is2DMounted = $state(
    selectedPane === "animation" || selectedPane === "tunnel"
  );
  let is3DMounted = $state(selectedPane === "animation-3d");
  let retainedMotionPane = $state<"animation" | "animation-3d">(
    selectedPane === "animation-3d" ? "animation-3d" : "animation"
  );
  $effect(() => {
    if (isAnimatorActive) {
      is2DMounted = true;
      if (is2DActive) retainedMotionPane = "animation";
    }
    if (is3DActive) {
      is3DMounted = true;
      retainedMotionPane = "animation-3d";
    }
  });
  const shouldRender3D = $derived(side === "left" ? is3DMounted : is3DActive);

  const loadViewer3DCanvas = () =>
    import("$lib/shared/3d/components/Viewer3DCanvas.svelte");

  // 3D is one click away from here, and its models are the slowest thing in the
  // app to arrive. Pull them into the browser cache while it is idle so the
  // first open spends its curtain on compiling rather than downloading.
  $effect(() => {
    warmSelectedSceneAssets();
  });
  let scene3DReady = $state(false);
  let animatorReady = $state(false);
  let animatorReadyFrame = 0;
  const preparedTunnelLayers = $derived(
    tunnelController.preparedAdditionalLayersAt(playback.currentStep)
  );
  let tunnelTextureStatus = $state<AdditionalLayerTextureStatus>({
    requested: 0,
    loaded: 0,
    loading: 0,
  });
  const tunnelTexturesReady = $derived(
    preparedTunnelLayers.length === 0 ||
      (tunnelTextureStatus.requested === preparedTunnelLayers.length &&
        tunnelTextureStatus.loaded === preparedTunnelLayers.length)
  );

  function handleTunnelTextureStatus(
    status: AdditionalLayerTextureStatus
  ): void {
    if (
      status.requested === tunnelTextureStatus.requested &&
      status.loaded === tunnelTextureStatus.loaded &&
      status.loading === tunnelTextureStatus.loading
    ) {
      return;
    }
    tunnelTextureStatus = status;
  }

  // Even an initial Tunnel load starts from the complete 2D frame; its copies
  // enter only after their sprites are drawable.
  const tunnelReveal = new Tween(0, {
    easing: cubicOut,
  });
  let tunnelRevealResetTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    clearTimeout(tunnelRevealResetTimer);
    tunnelRevealResetTimer = undefined;

    if (isTunnelActive) {
      // Sprite preparation is independent of the visible layer list, so it can
      // safely gate the first painted frame without deadlocking the reveal.
      // Until it resolves, the live 2D pair remains an honest complete frame.
      if (!tunnelController.layersReady || !tunnelTexturesReady) return;
      // 2D and Tunnel are one renderer, so their change reads as layers
      // blooming onto the live base. 3D is a distinct renderer: arrive at a
      // fully composed Tunnel before the canonical surface crossfade begins,
      // keeping that handoff to one opacity owner.
      void tunnelReveal.set(1, {
        duration:
          retainedMotionPane === "animation-3d"
            ? 0
            : motionDuration(TUNNEL_REVEAL_DURATION),
        easing: cubicOut,
      });
      return;
    }

    if (is3DActive && tunnelReveal.current > 0.001) {
      const resetDelay = motionDuration(TUNNEL_REVEAL_DURATION);
      if (resetDelay === 0) {
        void tunnelReveal.set(0, { duration: 0 });
      } else {
        // Hold the outgoing Tunnel intact until 3D has finished crossing over.
        // The hidden canvas can then reset without creating a second fade.
        tunnelRevealResetTimer = setTimeout(() => {
          tunnelRevealResetTimer = undefined;
          void tunnelReveal.set(0, { duration: 0 });
        }, resetDelay);
      }
      return;
    }

    void tunnelReveal.set(0, {
      duration: motionDuration(TUNNEL_REVEAL_DURATION),
      easing: cubicOut,
    });
  });
  $effect(() => () => clearTimeout(tunnelRevealResetTimer));
  const tunnelVisualActive = $derived(tunnelReveal.current > 0.001);
  const tunnelLayers = $derived.by(() => {
    if (!tunnelVisualActive) return [];
    return preparedTunnelLayers.map((layer, index) => ({
      ...layer,
      // The formation has already been sampled at the live playhead. Render it
      // where it belongs and vary only opacity; flying these authored poses out
      // of the base pair turned a quiet mode change into a scramble.
      opacity: resolveTunnelLayerOpacity(
        tunnelReveal.current,
        index,
        preparedTunnelLayers.length
      ),
    }));
  });
  const tunnelLayerOpacityMinimum = $derived(
    tunnelLayers.length === 0
      ? 0
      : Math.min(...tunnelLayers.map((layer) => layer.opacity ?? 1))
  );
  const tunnelLayerOpacityMaximum = $derived(
    tunnelLayers.length === 0
      ? 0
      : Math.max(...tunnelLayers.map((layer) => layer.opacity ?? 1))
  );
  const tunnelLayerOpacityMean = $derived(
    tunnelLayers.length === 0
      ? 0
      : tunnelLayers.reduce((total, layer) => total + (layer.opacity ?? 1), 0) /
          tunnelLayers.length
  );
  const tunnelPerceptibleLayerCount = $derived(
    tunnelLayers.filter((layer) => (layer.opacity ?? 1) >= 0.1).length
  );
  const tunnelLayerPoseDifferences = $derived(
    tunnelLayers.map((layer, index) => {
      const expected = preparedTunnelLayers[index];
      return Math.max(
        tunnelLayerPoseDifference(expected?.leftProp ?? null, layer.leftProp),
        tunnelLayerPoseDifference(expected?.rightProp ?? null, layer.rightProp)
      );
    })
  );
  const tunnelMovingLayerCount = $derived(
    tunnelLayerPoseDifferences.filter((difference) => difference > 0.001).length
  );
  const tunnelTrailSuppressedLayerCount = $derived(
    tunnelLayers.filter((layer) => layer.trailCaptureSuppressed).length
  );
  const tunnelFormationPoseDrift = $derived(
    Math.max(0, ...tunnelLayerPoseDifferences)
  );
  // The grid is part of the same transformation as the copies. Driving its
  // alpha from the shared reveal keeps a quick reversal continuous instead of
  // asking the renderer's independent visibility timer to catch up.
  const tunnelGridOpacity = $derived(
    resolveTunnelGridOpacity(tunnelReveal.current, tunnelController.gridVisible)
  );
  const activeEffect = $derived(effectsConfig?.activeEffect ?? "none");
  const tunnelTipEffectMap = $derived<TipEffectMap | undefined>(
    tunnelVisualActive && activeEffect !== "none"
      ? { "*": { effect: activeEffect } }
      : undefined
  );
  const tunnelFireConfig = { disableFrameCache: true } as const;
  const keep3DUntilTunnelPaints = $derived(
    isTunnelActive && retainedMotionPane === "animation-3d" && !animatorReady
  );
  // Selecting 3D presents a 3D-owned surface immediately. Its preparation
  // screen can then report the real engine, asset, performer, and shader phases
  // instead of leaving the old 2D mode on screen for an unknowable wait.
  const is3DPresented = $derived(is3DActive || keep3DUntilTunnelPaints);
  const is2DPresented = $derived(
    is2DActive || (isTunnelActive && !keep3DUntilTunnelPaints)
  );
  const is2DRailPresented = $derived(isAnimatorActive);
  const is3DRailPresented = $derived(is3DActive && scene3DReady);
  const is3DPreparing = $derived(
    side === "left" && is3DActive && is2DMounted && !scene3DReady
  );
  const presentedPane = $derived<"animation" | "animation-3d" | null>(
    is3DPresented ? "animation-3d" : is2DPresented ? "animation" : null
  );
  // The viewer can never be unconfigured, so its first-open guidance points at
  // the rail rather than walking a setup it already completed to draw a frame.
  // Building a scene from nothing lives in the 3D Studio (Scene3DSetupGuide).
  // `?intro=replay` forces the hint back on a profile that has dismissed it,
  // and `force` keeps that replay from re-marking it seen.
  const replayViewer3DIntro = isViewer3DIntroReplayRequested();
  let showViewer3DIntro = $state(
    replayViewer3DIntro || shouldShowViewer3DIntro()
  );
  let pane2D: HTMLDivElement | undefined = $state();
  let pane2DWidth = $state(0);
  let lastReadable2DWidth = $state(0);
  let pane3D: HTMLDivElement | undefined = $state();
  let rail2D: HTMLDivElement | undefined = $state();
  let rail3D: HTMLDivElement | undefined = $state();
  let previousPresentedPane = $state(presentedPane);
  let presentationWidthReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  let preparationCanvasWidth = $state<number | null>(null);
  let preparationCanvasWidthReleaseFrame: number | undefined;
  let leasedCurrent3DEntry = false;
  let contactBoundaryReportedReady = $state(false);
  let saveMenuHost: VisualSequenceSaveContextMenuHost | undefined = $state();
  let sceneControlLayout = $state<SceneControlLayout>({
    presentation: "overlay",
    panelWidth: 520,
    reservedWidth: 0,
  });

  // Remember the last width while 2D/Tunnel genuinely owns the stage. Once a
  // 3D selection starts, PanelGroup may publish a transient narrow width before
  // this component's pre-effect runs; that departure geometry is exactly what
  // the preparation lease must not capture.
  $effect(() => {
    const width = pane2DWidth;
    if (isAnimatorActive && width > 0) lastReadable2DWidth = width;
  });

  function handle3DContextMenu(event: MouseEvent): void {
    if (event.defaultPrevented || !is3DActive) return;
    event.preventDefault();
    saveMenuHost?.openContextMenu(event.clientX, event.clientY);
  }

  // The contact boundary is an intentional ready state, not a failed scene
  // load. Reporting ready keeps shared playback from being held behind a
  // curtain for a stage that must never mount.
  $effect(() => {
    if (side !== "left" || !is3DActive) return;

    if (requiresContactViewer) {
      contactBoundaryReportedReady = true;
      scene3DReady = true;
      onSceneReadyChange?.(true);
    } else if (contactBoundaryReportedReady) {
      contactBoundaryReportedReady = false;
      scene3DReady = false;
      onSceneReadyChange?.(false);
    }
  });

  // Freeze the outgoing primary surface for the crossfade so its canvas and
  // rail do not remeasure while their replacement becomes active.
  $effect(() => {
    const current = presentedPane;
    if (current === previousPresentedPane) return;
    const from = previousPresentedPane;
    previousPresentedPane = current;
    if (side !== "left" || !from || !current) return;

    const outgoingPane =
      from === "animation" ? pane2D : from === "animation-3d" ? pane3D : null;
    const outgoingRail =
      from === "animation" ? rail2D : from === "animation-3d" ? rail3D : null;
    if (!outgoingPane) return;

    const width = `${outgoingPane.getBoundingClientRect().width}px`;
    outgoingPane.style.width = width;
    if (outgoingRail) outgoingRail.style.width = width;

    const releaseWidth = () => {
      presentationWidthReleaseTimer = undefined;
      if (outgoingPane.isConnected) outgoingPane.style.width = "";
      if (outgoingRail?.isConnected) outgoingRail.style.width = "";
    };
    clearTimeout(presentationWidthReleaseTimer);
    const duration = motionDuration(DURATION.emphasis);
    if (duration === 0) {
      releaseWidth();
    } else {
      presentationWidthReleaseTimer = setTimeout(releaseWidth, duration);
    }
  });

  $effect(() => () => clearTimeout(presentationWidthReleaseTimer));

  // The first 3D boot can take several seconds. The surrounding workspace is
  // already moving from its inspector allocation to the full scene during
  // that time, but the inert outgoing canvas deliberately retains its old
  // backing store. Letting its DOM box stretch with the workspace magnifies
  // that raster and makes otherwise crisp prop artwork look badly compressed.
  //
  // Capture the last authored 2D width before the mode update paints. The live
  // canvas then glides to the center at that exact size during the short exit
  // dissolve. Release as soon as 2D is covered, giving its hidden backing store
  // the rest of 3D preparation to settle before any return.
  function schedulePreparationCanvasWidthRelease(): void {
    if (preparationCanvasWidthReleaseFrame !== undefined) {
      cancelAnimationFrame(preparationCanvasWidthReleaseFrame);
    }

    const releaseWhenCovered = () => {
      preparationCanvasWidthReleaseFrame = undefined;
      const outgoingOpacity = pane2D
        ? Number.parseFloat(getComputedStyle(pane2D).opacity)
        : 0;

      // Scene startup can briefly occupy the main thread. A wall-clock timer
      // may therefore expire before the browser has painted the outgoing
      // dissolve, exposing a stretched backing store for one late frame. Tie
      // the lease to what was actually painted: release only once 2D is hidden
      // (or once a reversal makes it the destination again).
      if (!is2DPresented && outgoingOpacity > 0.05) {
        preparationCanvasWidthReleaseFrame =
          requestAnimationFrame(releaseWhenCovered);
        return;
      }

      preparationCanvasWidth = null;
    };

    preparationCanvasWidthReleaseFrame =
      requestAnimationFrame(releaseWhenCovered);
  }

  $effect.pre(() => {
    if (side !== "left") return;
    if (!is3DPreparing) {
      leasedCurrent3DEntry = false;
      return;
    }
    if (leasedCurrent3DEntry) return;
    leasedCurrent3DEntry = true;

    // Re-entering while a reversal is still dissolving renews the same lease so
    // the sharp outgoing frame never changes size halfway through its fade.
    if (preparationCanvasWidth !== null) {
      schedulePreparationCanvasWidthRelease();
      return;
    }
    if (!pane2D) return;

    const width = lastReadable2DWidth || pane2D.getBoundingClientRect().width;
    if (width <= 0) return;
    preparationCanvasWidth = width;
    schedulePreparationCanvasWidthRelease();
  });

  $effect(() => {
    if (is3DActive || preparationCanvasWidth === null) return;
    schedulePreparationCanvasWidthRelease();
  });

  $effect(() => () => {
    if (preparationCanvasWidthReleaseFrame !== undefined) {
      cancelAnimationFrame(preparationCanvasWidthReleaseFrame);
    }
  });

  function handleCloseClick(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    onUnfocusPane();
  }

  function handleAnimatorCanvasReady(canvas: HTMLCanvasElement | null): void {
    cancelAnimationFrame(animatorReadyFrame);
    if (side === "left") onCanvasReady(canvas);
    if (!canvas) {
      animatorReady = false;
      if (side === "left") tunnelStage.setCanvas(null);
      return;
    }

    animatorReadyFrame = requestAnimationFrame(() => {
      animatorReadyFrame = requestAnimationFrame(() => {
        animatorReady = true;
        if (side === "left") tunnelStage.setCanvas(canvas);
      });
    });
  }

  $effect(() => () => cancelAnimationFrame(animatorReadyFrame));
</script>

{#snippet viewer3DLoading()}
  <ScenePreparationSurface statusText="Opening 3D" />
{/snippet}

{#snippet viewer3DError(_error: unknown, retry: () => void)}
  <div class="error-state viewer-3d-load-state" role="alert">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <span>3D viewer couldn't load. Check your connection and try again.</span>
    <PanelButton variant="secondary" onclick={retry}>
      <i class="fas fa-rotate-right" aria-hidden="true"></i>
      <span>Try again</span>
    </PanelButton>
  </div>
{/snippet}

{#if shouldRender3D}
  <div
    bind:this={pane3D}
    class="media-pane animation-pane"
    class:persistent-3d={side === "left"}
    class:content-overlay={side === "right"}
    class:persistent-3d-hidden={side === "left" && !is3DPresented}
    data-motion-surface="3d"
    data-presented={is3DPresented}
    data-scene-ready={scene3DReady}
    inert={!is3DActive}
    aria-hidden={!is3DActive}
    data-scene-inspector-docked={sceneControlLayout.reservedWidth > 0 ||
      undefined}
    style:--scene-control-reserved-width="{sceneControlLayout.reservedWidth}px"
  >
    {#if side === "left" && is3DActive && layout.focusedPane === "animation" && !layout.isMobile && !layout.suppressCloseButton}
      <div
        class="pane-close-btn"
        role="button"
        tabindex="0"
        onclick={handleCloseClick}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            handleCloseClick(event);
        }}
        aria-label="Exit focus mode"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </div>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="canvas-layer canvas-3d-layer"
      style="opacity:1;pointer-events:auto;"
      oncontextmenu={handle3DContextMenu}
    >
      {#if requiresContactViewer}
        <ContactViewerRequired compact={side === "right"} />
      {:else}
        <LazyMount
          loader={loadViewer3DCanvas}
          active={is3DActive}
          prefetch
          debugName="3D viewer canvas"
          placeholder={viewer3DLoading}
          error={viewer3DError}
          props={{
            sequenceData: playback.animationState.sequenceData,
            currentStep: playback.currentStep,
            isPlaying: playback.isPlaying,
            bpm,
            onBpmChange,
            leftPropType:
              propRendering.leftPropType != null
                ? String(propRendering.leftPropType)
                : null,
            rightPropType:
              propRendering.rightPropType != null
                ? String(propRendering.rightPropType)
                : null,
            hideOverlays: false,
            fullScreen: side === "left" && layout.focusedPane === "animation",
            onExitFullScreen: onUnfocusPane,
            rendererHandleRequired,
            onPlaybackToggle,
            onSystemPlaybackChange,
            onProgressBarSeek,
            playbackMode,
            onPlaybackModeChange,
            onSettingChange: onViewer3DSettingChange,
            onSceneReadyChange: (ready: boolean) => {
              if (side !== "left") return;
              scene3DReady = ready;
              onSceneReadyChange?.(ready);
            },
            initialRevealMode: "gated",
          }}
        />
      {/if}
    </div>
  </div>
{/if}

{#if is2DMounted}
  <div
    bind:this={pane2D}
    bind:clientWidth={pane2DWidth}
    class="media-pane animation-pane persistent-2d"
    class:persistent-2d-hidden={!is2DPresented}
    data-motion-surface="2d"
    data-persistent-animator
    data-renderer-mode={isTunnelActive ? "tunnel" : "2d"}
    data-tunnel-blend={tunnelReveal.current.toFixed(3)}
    data-tunnel-layers-ready={tunnelController.layersReady}
    data-tunnel-layer-count={tunnelLayers.length}
    data-tunnel-prepared-layer-count={preparedTunnelLayers.length}
    data-tunnel-texture-requested={tunnelTextureStatus.requested}
    data-tunnel-texture-loaded={tunnelTextureStatus.loaded}
    data-tunnel-textures-ready={tunnelTexturesReady}
    data-tunnel-layer-opacity-min={tunnelLayerOpacityMinimum.toFixed(3)}
    data-tunnel-layer-opacity-max={tunnelLayerOpacityMaximum.toFixed(3)}
    data-tunnel-layer-opacity-mean={tunnelLayerOpacityMean.toFixed(3)}
    data-tunnel-perceptible-layer-count={tunnelPerceptibleLayerCount}
    data-tunnel-moving-layer-count={tunnelMovingLayerCount}
    data-tunnel-trail-suppressed-layer-count={tunnelTrailSuppressedLayerCount}
    data-tunnel-formation-pose-drift={tunnelFormationPoseDrift.toFixed(3)}
    data-tunnel-grid-opacity={tunnelGridOpacity.toFixed(3)}
    data-presented={is2DPresented}
    inert={!isAnimatorActive}
    aria-hidden={!isAnimatorActive}
  >
    {#if side === "left" && is2DActive && layout.focusedPane === "animation" && !layout.isMobile && !layout.suppressCloseButton}
      <div
        class="pane-close-btn"
        role="button"
        tabindex="0"
        onclick={handleCloseClick}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            handleCloseClick(event);
        }}
        aria-label="Exit focus mode"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </div>
    {/if}

    {#if side === "left" && playback.animationLoading}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
      </div>
    {:else if side === "left" && playback.animationState.error}
      <div class="error-state">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{playback.animationState.error}</span>
      </div>
    {:else}
      {#if side === "left" && practiceActive && practiceMirrorEnabled}
        <div class="practice-mirror-layer">
          <CameraPreview mirrored={true} />
        </div>
      {/if}
      <div
        class="canvas-layer canvas-2d-layer"
        use:ownCanvas={{
          target:
            side === "left" ? (studioSurfaces?.canvasTarget ?? null) : null,
          animate: true,
          visualSelector: ".content-wrapper > .canvas-wrapper",
          onMoving: side === "left" ? studioSurfaces?.setMoving : undefined,
        }}
        class:canvas-2d-preparation-held={!inStudio &&
          preparationCanvasWidth !== null}
        data-3d-preparation-held={preparationCanvasWidth !== null || undefined}
        data-shared-animation-surface
        data-animation-position={studioFrame?.position ?? playback.currentStep}
        style:--preparation-canvas-width={preparationCanvasWidth === null
          ? undefined
          : `${preparationCanvasWidth}px`}
        style="opacity:1;pointer-events:auto;"
      >
        <!-- Focused 2D and Tunnel keep the same full transport. In the phone's
             split view the card already owns seeking and the canvas owns
             play/pause, so the duplicate transport disappears and its height
             returns to the stage. Practice keeps the transport because its
             read-ahead lane is not a card navigator. -->
        <AnimatorCanvas
          shareStudioTransport={side === "left"}
          sequenceData={studioFrame?.sequence ??
            playback.animationState.sequenceData}
          currentStep={studioFrame?.position ?? playback.currentStep}
          isPlaying={studioFrame?.playing ?? playback.isPlaying}
          virtualTime={studioFrame
            ? undefined
            : playback.animationState.virtualTime}
          leftProp={studioFrame
            ? studioFrame.left
            : playback.animationState.leftPropState}
          rightProp={studioFrame
            ? studioFrame.right
            : playback.animationState.rightPropState}
          additionalLayers={inStudio ? [] : tunnelLayers}
          preloadAdditionalLayers={preparedTunnelLayers}
          onAdditionalLayerTextureStatusChange={handleTunnelTextureStatus}
          tunnelSpectrum={tunnelController.spectrum}
          tunnelPropColors={tunnelController.exactPropColors}
          tunnelSelectedLayer={tunnelVisualActive
            ? tunnelController.spotlightLayers
            : null}
          gridMode={sequence?.gridMode}
          gridVisible={true}
          gridOpacity={inStudio ? 1 : tunnelGridOpacity}
          letter={studioFrame
            ? (studioFrame.step?.letter ?? null)
            : playback.currentLetter}
          stepData={studioFrame
            ? (studioFrame.step ?? null)
            : playback.currentStepData}
          word={inStudio ? null : sequence?.word}
          leftPropType={studioFrame?.leftPropType ?? propRendering.leftPropType}
          rightPropType={studioFrame?.rightPropType ??
            propRendering.rightPropType}
          fanAppearance={propRendering.fanAppearance}
          backgroundAlpha={side === "left" &&
          practiceActive &&
          practiceMirrorEnabled
            ? 0
            : 1}
          {trailSettings}
          onCanvasReady={handleAnimatorCanvasReady}
          {onPlaybackToggle}
          onProgressBarSeek={onProgressBarSeek ?? null}
          onProgressBarScrubStart={onProgressBarScrubStart ?? null}
          onProgressBarScrubEnd={onProgressBarScrubEnd ?? null}
          focused={side === "left" && layout.focusedPane === "animation"}
          suppress2DOverlays={false}
          fillContainer
          glyphFrame="stage"
          hideProgressBar={inStudio ||
            (side === "left"
              ? suppressProgress ||
                (!practiceActive &&
                  layout.isMobile &&
                  layout.focusedPane === null)
              : true)}
          hideHeader
          hideTkaGlyph={tunnelVisualActive}
          hideStepNumbers={tunnelVisualActive}
          hidePathLines={tunnelVisualActive}
          tapToToggle={side === "left" && !inStudio}
          hoverHint={isTunnelActive ? "badge" : undefined}
          cornerToggle={isTunnelActive}
          hidePlay={false}
          progressLine={false}
          bpm={side === "left" ? bpm : undefined}
          onBpmChange={side === "left" ? onBpmChange : undefined}
          playbackMode={side === "left" ? playbackMode : undefined}
          onPlaybackModeChange={side === "left"
            ? onPlaybackModeChange
            : undefined}
          resizePaused={practiceResizePaused}
          tipEffectMap={tunnelTipEffectMap}
          fireConfig={tunnelVisualActive ? tunnelFireConfig : undefined}
          extraContextMenuItems={isTunnelActive
            ? tunnelStage.saveMenuItems
            : []}
          {onSaveToLibrary}
        />
      </div>
    {/if}
  </div>
{/if}

<VisualSequenceSaveContextMenuHost
  bind:this={saveMenuHost}
  {sequence}
  {onSaveToLibrary}
/>

{#if side === "left" && is2DMounted}
  <div
    bind:this={rail2D}
    class="persistent-rail"
    class:persistent-rail-hidden={!is2DRailPresented}
    inert={!is2DActive}
    aria-hidden={!is2DActive}
  ></div>
{/if}

{#if side === "left" && is3DMounted && !requiresContactViewer}
  <div
    bind:this={rail3D}
    class="persistent-rail"
    class:persistent-rail-hidden={!is3DRailPresented}
    inert={!is3DActive}
    aria-hidden={!is3DActive}
  >
    <SceneControlWorkspace
      {bpm}
      onSettingChange={onViewer3DSettingChange}
      onAction={onViewer3DAction}
      onLayoutChange={(next) => (sceneControlLayout = next)}
    />
    {#if is3DActive && scene3DReady && showViewer3DIntro}
      <Viewer3DRailHint
        onSettingChange={onViewer3DSettingChange}
        force={replayViewer3DIntro}
        onDismiss={() => (showViewer3DIntro = false)}
      />
    {/if}
  </div>
{/if}

<style>
  /* A relocated surface cannot depend on the split pane's ancestor selectors
     for its height. Its destination owns the box in either workspace. */
  .canvas-2d-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
