<script module lang="ts">
  // Two canvases can be alive at once (split pane plus a fullscreen handoff),
  // and the background hold is refcounted per key — so each instance needs one
  // of its own or the first release would unfreeze the backdrop under the other.
  let viewer3DInstanceCount = 0;
  function nextViewer3DInstanceId(): number {
    viewer3DInstanceCount += 1;
    return viewer3DInstanceCount;
  }
</script>

<script lang="ts">
  /**
   * Viewer3DCanvas
   *
   * Drop-in replacement for AnimatorCanvas in 3D render mode.
   * Wraps a Threlte <Canvas> with Viewer3DScene (scene geometry + puppet loop)
   * and Viewer3DCamera (orbit controls). Reads character state from the shared
   * viewer-3d context - the parent must have called setViewer3DContext() before
   * mounting this component.
   *
   * Ordinary viewers wait for choreography and its first performer before
   * opening WebGL. Scene-authoring surfaces can opt into the empty environment
   * so the workspace exists before choreography is chosen.
   */

  import { onDestroy, type Snippet } from "svelte";
  import { Canvas } from "@threlte/core";
  import { WebGLRenderer } from "three";

  import Viewer3DScene from "./Viewer3DScene.svelte";
  import Viewer3DCamera from "./Viewer3DCamera.svelte";
  import Viewer3DCanvasRef from "./Viewer3DCanvasRef.svelte";
  import PerfMonitor from "./PerfMonitor.svelte";
  import type { RendererPerformanceSample } from "./renderer-performance-window";
  import InteractiveCanvasFrameBridge from "./InteractiveCanvasFrameBridge.svelte";
  import WorkerViewer3DScene from "./WorkerViewer3DScene.svelte";
  import GaitProbe from "../diagnostics/gait/GaitProbe.svelte";
  import GaitOverlay from "../diagnostics/gait/GaitOverlay.svelte";
  import { gaitProbeState } from "../diagnostics/gait/gait-probe-state.svelte";
  import { getViewer3DContext } from "../context/viewer-3d-context";
  import { createSceneFeatureState } from "../scene-features/state/scene-feature-state.svelte";
  import {
    setSceneFeatureContext,
    tryGetSceneFeatureContext,
  } from "../scene-features/context/scene-feature-context";
  import SceneLoadingCurtain from "../scene-features/components/SceneLoadingCurtain.svelte";
  import { createViewerCameraPlayerState } from "@austencloud/camera-3d";
  import { getInputCapabilities } from "$lib/shared/input/InputCapabilities.svelte";
  import {
    holdBackground,
    releaseBackground,
  } from "$lib/shared/background/shared/state/background-hold.svelte";
  import SceneShaderWarmup from "./SceneShaderWarmup.svelte";
  import InteractivePropAssetWarmup from "./InteractivePropAssetWarmup.svelte";
  import { createCharacterPlaybackAdapter } from "$lib/shared/timeline/adapters/character-playback-adapter.svelte";
  import type { PlaybackMode } from "$lib/shared/timeline/unified-playback-context";
  import { sceneLoadingPlaybackTransition } from "../domain/scene-loading-playback";
  import { selectBeatPlaneStep } from "../domain/beat-plane-step-selection";
  import { getQualityTierDetector } from "../effects/quality/get-quality-tier-detector";
  import { createAdaptiveQualityState } from "../state/adaptive-quality-state.svelte";
  import { setAdaptiveQualityContext } from "../context/adaptive-quality-context";
  import { setEnvironmentTransitionVisualContext } from "../environments/context/environment-transition-visual-context";
  import { createEnvironmentTransitionVisualState } from "../environments/state/environment-transition-visual-state.svelte";
  import type { QualityTier } from "../effects/types";
  import type { ViewerControlSink } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import { tryGetViewerUrlSessionContext } from "$lib/shared/sequence-viewer/services/viewer-url-session";
  import { captureT3Slice } from "$lib/shared/sequence-viewer/services/viewer-url-slices/t3-slice";

  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { CameraStateSnapshot } from "@austencloud/scene-3d";
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { EnvironmentTransitionObservation } from "../environments/domain/environment-transition";
  import { getSceneEnvironmentRendererKey } from "../environments/domain/scene-environment";
  import { hasExactWorkerSceneFeatures } from "../worker-renderer/domain/worker-scene-feature-capability";
  import {
    getBackgroundTypeForWorkerEnvironment,
    getWorkerEnvironmentKey,
    type WorkerViewerActualConditions,
  } from "../worker-renderer/domain/worker-viewer-backend";
  import type { WorkerViewerFallbackReason } from "../worker-renderer/domain/worker-viewer-capability";
  import type { WorkerSceneSwitchSnapshot } from "../worker-renderer/services/worker-environment-renderer";
  import { supportsWorkerEnvironmentRenderer } from "../worker-renderer/services/worker-environment-renderer";
  import { resolveWorkerScenePreparationProgress } from "../worker-renderer/domain/worker-scene-preparation-progress";

  interface Props {
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    bpm?: number;
    onBpmChange?: (bpm: number) => void;
    leftPropType?: string | null;
    rightPropType?: string | null;
    hideOverlays?: boolean;
    /** Hide in-world review markers while keeping the character and effects. */
    hideSceneMarkers?: boolean;
    /** Hide performer numbers without suppressing plane grids. */
    hidePerformerBadges?: boolean;
    /** Show dictated plane grids without the center sphere and axis arrows. */
    hideOrientationHelpers?: boolean;
    fullScreen?: boolean;
    onExitFullScreen?: () => void;
    onRendererReady?: (renderer: WebGLRenderer | null) => void;
    /**
     * Force the legacy Threlte backend while a caller needs direct renderer,
     * scene, and camera handles (live 3D recording/export).
     */
    rendererHandleRequired?: boolean;
    onEnvironmentTransitionChange?: (
      observation: EnvironmentTransitionObservation<BackgroundType>
    ) => void;
    onCameraStateChange?: (state: CameraStateSnapshot) => void;
    onPlaybackToggle?: () => void;
    isLooping?: boolean;
    onLoopToggle?: () => void;
    onSystemPlaybackChange?: (
      playing: boolean,
      source: "system_3d_loading"
    ) => void;
    onProgressBarSeek?: (targetStep: number) => void;
    playbackMode?: PlaybackMode;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    /** Fires when the scene load gate opens/closes (first-load latched). The
        parent withholds the 3D rail chrome until the stage is ready. */
    onSceneReadyChange?: (ready: boolean) => void;
    /** Decorative async features that may finish after the studio is usable. */
    initialRevealDeferredFeatures?: readonly string[];
    /**
     * `gated` preserves the production scene-change curtain. `streaming` puts
     * the canvas on screen immediately and lets environment assets arrive in
     * place, which is what focused scene-authoring surfaces need.
     */
    initialRevealMode?: "gated" | "streaming";
    /** Model inspection can omit the full visual-effects runtime. */
    enableEffects?: boolean;
    /** Stationary review casts do not need the game locomotion pack. */
    enablePerformerLocomotion?: boolean;
    /** Attach props to the achieved palm and knuckle line. Requires the main-thread rig. */
    weldPerformerGrip?: boolean;
    /** Cap expensive prop effects when one shot contains a large ensemble. */
    effectQualityTier?: QualityTier;
    /** Keep the first-load curtain up until every active character is visible. */
    waitForPerformersOnInitialReveal?: boolean;
    /** Per-performer count offsets for directed canon/ripple performances. */
    performerStepOffsets?: readonly number[];
    /** Resolved per-performer step for hosts whose lanes run independent clocks. */
    performerSteps?: readonly (number | null | undefined)[] | null;
    /** Host world geometry rendered in the performer coordinate frame. */
    worldChildren?: Snippet;
    /** Keep reserved rigs mounted while rendering only the active shot's cast. */
    visiblePerformerCount?: number;
    /** Fixed stage extent for hosts whose cast walks — see Viewer3DScene. */
    stageBoundsPositions?: readonly { x: number; z: number }[] | null;
    /** A stage the host authored — see Viewer3DScene. */
    stageExtent?: { width: number; depth: number } | null;
    /** Keep these already-prepared environments mounted between cinematic cuts. */
    retainedEnvironmentTypes?: readonly BackgroundType[];
    /** Lets a film-level compositor own the visible edit between retained worlds. */
    environmentTransitionVisualMode?: "internal" | "host-controlled";
    /** Host-specific rescue window for an intentionally heavy first scene. */
    sceneLoadTimeoutMs?: number;
    onSettingChange?: ViewerControlSink;
    /** Mount the environment and camera before choreography adds a performer. */
    renderEmptyScene?: boolean;
    /** Production-graph instrumentation hook used by focused benchmark hosts. */
    onPerformanceSample?: (sample: RendererPerformanceSample) => void;
    performanceWarmupMs?: number;
    /** Review-only escape hatch for reproducing world-scale camera poses. */
    cameraMaxOrbitDistance?: number;
    /** Review-only field-of-view override; ordinary viewers retain 50 degrees. */
    cameraFov?: number;
  }

  let {
    sequenceData,
    currentStep,
    isPlaying,
    bpm = 60,
    onBpmChange = () => {},
    leftPropType = null,
    rightPropType = null,
    hideOverlays = false,
    hideSceneMarkers = false,
    hidePerformerBadges = false,
    hideOrientationHelpers = false,
    fullScreen = false,
    onExitFullScreen,
    onRendererReady,
    rendererHandleRequired = false,
    onEnvironmentTransitionChange,
    onCameraStateChange,
    onPlaybackToggle,
    isLooping,
    onLoopToggle,
    onSystemPlaybackChange,
    onProgressBarSeek,
    playbackMode,
    onPlaybackModeChange,
    onSceneReadyChange,
    initialRevealDeferredFeatures = [],
    initialRevealMode = "gated",
    enableEffects = true,
    enablePerformerLocomotion = true,
    weldPerformerGrip = false,
    effectQualityTier,
    waitForPerformersOnInitialReveal = false,
    performerStepOffsets = [],
    performerSteps = null,
    worldChildren,
    visiblePerformerCount,
    stageBoundsPositions = null,
    stageExtent = null,
    retainedEnvironmentTypes = [],
    environmentTransitionVisualMode = "internal",
    sceneLoadTimeoutMs = 15_000,
    onSettingChange,
    renderEmptyScene = false,
    onPerformanceSample,
    performanceWarmupMs = 0,
    cameraMaxOrbitDistance,
    cameraFov,
  }: Props = $props();

  type ScenePostProcessingModule =
    typeof import("../effects/post-processing/ScenePostProcessing.svelte");
  type SceneAudioPlayerModule = typeof import("./SceneAudioPlayer.svelte");
  type StepPlaneStripModule = typeof import("./controls/StepPlaneStrip.svelte");
  type UnifiedTimelineModule =
    typeof import("$lib/shared/timeline/UnifiedTimeline.svelte");

  let scenePostProcessingPromise: Promise<ScenePostProcessingModule> | null =
    null;
  let sceneAudioPlayerPromise: Promise<SceneAudioPlayerModule> | null = null;
  let stepPlaneStripPromise: Promise<StepPlaneStripModule> | null = null;
  let unifiedTimelinePromise: Promise<UnifiedTimelineModule> | null = null;

  const loadScenePostProcessing = () =>
    (scenePostProcessingPromise ??=
      import("../effects/post-processing/ScenePostProcessing.svelte"));
  const loadSceneAudioPlayer = () =>
    (sceneAudioPlayerPromise ??= import("./SceneAudioPlayer.svelte"));
  const loadStepPlaneStrip = () =>
    (stepPlaneStripPromise ??= import("./controls/StepPlaneStrip.svelte"));
  const loadUnifiedTimeline = () =>
    (unifiedTimelinePromise ??=
      import("$lib/shared/timeline/UnifiedTimeline.svelte"));

  const viewer3DState = getViewer3DContext();
  // Provide one stable, hardware-detected visual tier plus adaptive DPR to the
  // scene subtree. Frame pressure may reduce resolution, but it must not swap
  // effects, lighting, or environment detail for a cheaper look mid-session.
  const qualityTierDetector = getQualityTierDetector();
  qualityTierDetector.detectFromBrowserCapabilities();
  const adaptiveQuality = createAdaptiveQualityState(qualityTierDetector);
  setAdaptiveQualityContext(adaptiveQuality);
  const environmentTransitionVisual = createEnvironmentTransitionVisualState();
  setEnvironmentTransitionVisualContext(environmentTransitionVisual);
  const playbackAdapter = $derived.by(() =>
    createCharacterPlaybackAdapter(
      () => viewer3DState.performerManager.performers[0] ?? null,
      onPlaybackToggle && onProgressBarSeek
        ? {
            onPlaybackToggle,
            onProgressBarSeek,
            getIsPlaying: () => isPlaying,
            getCurrentStep: () => currentStep,
            getTotalSteps: () => sequenceData?.steps.length ?? 0,
            getIsLooping:
              isLooping === undefined ? undefined : () => isLooping ?? false,
            onLoopToggle,
          }
        : undefined,
      onPlaybackModeChange
        ? {
            getBpm: () => bpm,
            onBpmChange,
            getPlaybackMode: () => playbackMode ?? "continuous",
            onPlaybackModeChange,
          }
        : undefined
    )
  );
  // A seeded viewer (a saved-scene preview) carries its own feature set and is
  // isolated from the shared `tka-scene-features` key; an ordinary viewer reads
  // and writes that key as before. A shared-link override (`t3` URL slice)
  // takes the same isolated path for the same reason: the sender's toggles must
  // render without the recipient's key being read or written.
  const seededFeatures =
    viewer3DState.seededSceneFeatures ?? viewer3DState.viewOnlySceneFeatures;
  const inheritedSceneFeatureState = tryGetSceneFeatureContext();
  const sceneFeatureState =
    seededFeatures !== null
      ? createSceneFeatureState(seededFeatures, {
          isolated: true,
          initialRevealDeferredFeatures,
        })
      : (inheritedSceneFeatureState ?? createSceneFeatureState());
  setSceneFeatureContext(sceneFeatureState);

  // ── t3 URL slice ─────────────────────────────────────────────────────────
  // The 3D pane, not the orchestrator, owns the scene-feature state, so the
  // capture registers here. `undefined` outside a sequence viewer (saved-scene
  // tiles, the composer demo, test routes all mount this canvas) — registration
  // is then a no-op. The seed half of the slice was already applied upstream,
  // through `viewOnlyEnvironmentId` / `viewOnlySceneFeatures`.
  const viewerUrlSession = tryGetViewerUrlSessionContext();
  const captureT3 = (options: { full?: boolean } = {}) =>
    captureT3Slice(
      {
        environmentId: viewer3DState.environmentId,
        features: sceneFeatureState,
      },
      options
    );
  if (viewerUrlSession) {
    const unregisterT3Slice = viewerUrlSession.registerSlice("t3", captureT3);
    onDestroy(unregisterT3Slice);
  }
  // The orchestrator's live-sync effect settled before this pane's chunk
  // finished loading, so it never tracked the state above and cannot re-run on
  // it. This effect does that tracking pane-side and asks the session for a
  // write — the same gap `an`'s visibility observer closes on the 2D side.
  $effect(() => {
    if (!viewerUrlSession) return;
    void captureT3();
    viewerUrlSession.scheduleUrlWrite();
  });
  // Primary performer - gates the Canvas on performer[0] existing. Multi-
  // performer rendering iterates inside Viewer3DScene itself, but the Canvas
  // still waits on this to avoid mounting WebGL before any performer exists.
  const characterState = $derived(
    viewer3DState.performerManager.performers[0] ?? null
  );
  const canRenderScene = $derived(
    renderEmptyScene || Boolean(characterState && sequenceData)
  );
  const shaderWarmupCacheKey = $derived(
    retainedEnvironmentTypes.length > 0
      ? getSceneEnvironmentRendererKey(viewer3DState.environmentId)
      : null
  );
  const workerEnvironment = $derived(
    getWorkerEnvironmentKey(viewer3DState.environmentId)
  );
  let workerRuntimeFailedFor = $state<BackgroundType | null>(null);
  const workerConditions = $derived.by(
    (): WorkerViewerActualConditions => ({
      offscreenCanvasAvailable: supportsWorkerEnvironmentRenderer(),
      // Selection, badges, hover, and direct manipulation are exact in the
      // worker path. Dictated grid planes are not yet clone-safe, so a visible
      // grid deliberately keeps the full legacy scene.
      visibleSceneMarkerCount:
        hideSceneMarkers || viewer3DState.visiblePlanes.size === 0
          ? 0
          : viewer3DState.visiblePlanes.size,
      visibleAudienceMemberCount: sceneFeatureState.isEnabled("audience")
        ? 1
        : 0,
      worldChildCount: worldChildren ? 1 : 0,
      retainedEnvironmentCount: retainedEnvironmentTypes.length,
      cameraMode: viewer3DState.navMode,
      captureInProgress: viewer3DState.isExporting,
      rendererHandleConsumerCount:
        (onRendererReady ? 1 : 0) +
        (rendererHandleRequired || weldPerformerGrip ? 1 : 0),
    })
  );
  const workerHostExact = $derived(
    workerEnvironment !== null &&
      workerRuntimeFailedFor !==
        getSceneEnvironmentRendererKey(viewer3DState.environmentId) &&
      workerConditions.offscreenCanvasAvailable &&
      workerConditions.visibleSceneMarkerCount === 0 &&
      workerConditions.visibleAudienceMemberCount === 0 &&
      workerConditions.worldChildCount === 0 &&
      workerConditions.retainedEnvironmentCount === 0 &&
      workerConditions.cameraMode === "orbit" &&
      !workerConditions.captureInProgress &&
      workerConditions.rendererHandleConsumerCount === 0 &&
      hasExactWorkerSceneFeatures(sceneFeatureState) &&
      initialRevealMode === "gated" &&
      environmentTransitionVisualMode === "internal" &&
      !renderEmptyScene &&
      !stageBoundsPositions &&
      !stageExtent &&
      !onPerformanceSample &&
      !gaitProbeState.enabled &&
      leftPropType !== null &&
      rightPropType !== null &&
      viewer3DState.performerManager.renderablePerformers.every(
        ({ presencePhase }) => presencePhase === "present"
      )
  );

  // Production viewers give their curtain one frame to paint before WebGL
  // starts. A focused scene workbench has no curtain, so delaying the canvas
  // only creates a fake blank loading step.
  let canvasMountReady = $state(false);

  // Read `?gait=1` once, on the client, where a URL exists. Doing it here
  // rather than at module scope keeps SSR from deciding the answer for a
  // session it cannot see the address bar of.
  $effect(() => {
    gaitProbeState.syncFromEnvironment();
  });

  $effect(() => {
    if (
      initialRevealMode === "gated" &&
      characterState &&
      sequenceData &&
      !canvasMountReady
    ) {
      requestAnimationFrame(() => {
        canvasMountReady = true;
      });
    }
    if (!characterState || !sequenceData) {
      canvasMountReady = false;
    }
  });

  // Camera-player state for fly mode. This is the VIEWER's avatar (what WASD
  // moves), not the performer. Created once per canvas mount so fly-mode
  // position survives mode toggles within the same session.
  const cameraPlayer = createViewerCameraPlayerState({ spawnY: -1.5 });

  // Fly mode only makes sense when the canvas owns the full viewport AND the
  // user has a mouse + keyboard. Side-by-side with the choreo card: pointer
  // lock on half a screen is disorienting and there's no WASD on touch.
  const inputCaps = getInputCapabilities();
  const navToggleVisible = $derived(
    fullScreen && inputCaps.canUsePointerLock()
  );

  // If the nav toggle hides while the user is in fly/walk mode (e.g. they
  // collapsed to side-by-side, or resized to mobile), snap back to orbit so
  // they're not stranded in a mode whose toggle isn't reachable.
  $effect(() => {
    if (!navToggleVisible && viewer3DState.navMode !== "orbit") {
      viewer3DState.setNavMode("orbit");
    }
  });

  // Start the safety timeout after the canvas mounts. Streaming workbenches do
  // not use canvasMountReady, but their scene components still need the same
  // protection against an async feature that never reports completion.
  $effect(() => {
    if (!renderEmptyScene && !canvasMountReady && initialRevealMode === "gated")
      return;
    const features = sceneFeatureState.features.filter(
      (f) => f.requiresAsyncLoad && sceneFeatureState.isEnabled(f.key)
    );
    console.debug(
      `[Viewer3DCanvas] async features enabled: [${features.map((f) => f.key)}]`
    );

    const timer = setTimeout(() => {
      if (sceneFeatureState.allEnabledReady) return;
      const pending = features.filter((f) => !sceneFeatureState.isReady(f.key));
      console.warn(
        `[Viewer3DCanvas] 15s timeout - force-readying stuck features: [${pending.map((f) => f.key)}]`
      );
      for (const f of pending) {
        sceneFeatureState.reportReady(f.key);
      }
    }, sceneLoadTimeoutMs);

    return () => clearTimeout(timer);
  });

  // ── Scene load gate ──
  // First-load latch: true once every enabled async scene feature has reported
  // ready. Never flips back if the user toggles a feature on later (matches the
  // curtain's own latch), so the rail/playback gate only fires on first load.
  let rendererReady = $state(false);
  let interactivePropsReady = $state(false);
  let effectsRuntimeReady = $state(!enableEffects);
  let sceneReady = $state(false);
  let environmentSettled = $state(true);
  let readyPerformerCount = $state(0);
  let totalPerformerCount = $state(0);
  const performersReady = $derived(
    !waitForPerformersOnInitialReveal ||
      totalPerformerCount === 0 ||
      readyPerformerCount >= totalPerformerCount
  );
  const performerRevealProgress = $derived(
    totalPerformerCount === 0
      ? 1
      : Math.min(readyPerformerCount / totalPerformerCount, 1)
  );

  function handlePerformerReadinessChange(
    readyCount: number,
    totalCount: number
  ): void {
    readyPerformerCount = readyCount;
    totalPerformerCount = totalCount;
  }

  $effect(() => {
    if (
      !sceneReady &&
      sceneFeatureState.allInitialRevealFeaturesReady &&
      rendererReady &&
      performersReady
    ) {
      sceneReady = true;
    }
  });

  function handleRendererReadyChange(ready: boolean): void {
    rendererReady = ready;
    environmentTransitionVisual.setRendererReady(ready);
    if (ready) adaptiveQuality.armSettleWindow();
  }

  function handleEnvironmentTransitionChange(
    observation: EnvironmentTransitionObservation<BackgroundType>
  ): void {
    environmentSettled = observation.settled;
    if (!observation.settled) adaptiveQuality.armSettleWindow();
    onEnvironmentTransitionChange?.(observation);
  }

  let lastWorkerPhase: WorkerSceneSwitchSnapshot["phase"] | null = null;

  function failWorkerRenderer(
    reasons: readonly WorkerViewerFallbackReason[] | readonly string[]
  ): void {
    const background = getSceneEnvironmentRendererKey(
      viewer3DState.environmentId
    );
    console.warn(
      `[Viewer3DCanvas] worker renderer fell back for ${background}: ${reasons.join(", ")}`
    );
    workerRuntimeFailedFor = background;
    rendererReady = false;
    effectsRuntimeReady = !enableEffects;
    environmentSettled = true;
    lastWorkerPhase = null;
    if (sceneFeatureState.isEnabled("environment")) {
      sceneFeatureState.resetReady("environment");
    }
  }

  function handleWorkerSnapshot(snapshot: WorkerSceneSwitchSnapshot): void {
    (
      window as typeof window & {
        __workerSceneSwitch?: WorkerSceneSwitchSnapshot;
      }
    ).__workerSceneSwitch = snapshot;

    if (snapshot.phase === "unsupported" || snapshot.phase === "error") {
      failWorkerRenderer([snapshot.lastError ?? snapshot.phase]);
      return;
    }

    const requested = getSceneEnvironmentRendererKey(
      viewer3DState.environmentId
    );
    const mounted = snapshot.active
      ? getBackgroundTypeForWorkerEnvironment(snapshot.active)
      : null;
    if (snapshot.phase === "booting" || snapshot.phase === "swapping") {
      if (lastWorkerPhase !== "booting" && snapshot.phase === "booting") {
        sceneFeatureState.resetReady("environment");
      }
      lastWorkerPhase = snapshot.phase;
      environmentSettled = false;
      handleRendererReadyChange(false);
      const preparation = resolveWorkerScenePreparationProgress(
        snapshot.progressPhase,
        snapshot.progress
      );
      sceneFeatureState.reportProgress(
        "environment",
        preparation.assetProgress
      );
      sceneFeatureState.reportWarmupProgress(preparation.warmupProgress);
      onEnvironmentTransitionChange?.({
        requestedKey: requested,
        mountedKey: mounted,
        phase: "waiting",
        settled: false,
      });
      return;
    }

    if (snapshot.phase === "idle" && snapshot.active === workerEnvironment) {
      lastWorkerPhase = "idle";
      sceneFeatureState.reportProgress("environment", 1);
      // Idle is published only after the worker produced a complete frame and
      // the service atomically exposed its canvas. This is the worker backend's
      // equivalent of SceneShaderWarmup opening the legacy renderer's gate.
      sceneFeatureState.reportWarmupProgress(1);
      sceneFeatureState.reportReady("environment");
      handlePerformerReadinessChange(
        viewer3DState.performerManager.performers.length,
        viewer3DState.performerManager.performers.length
      );
      effectsRuntimeReady = true;
      handleRendererReadyChange(true);
      environmentSettled = true;
      onEnvironmentTransitionChange?.({
        requestedKey: requested,
        mountedKey: requested,
        phase: "idle",
        settled: true,
      });
    }
  }

  // Tell the parent so it can withhold the 3D rail chrome until the stage is set.
  $effect(() => {
    onSceneReadyChange?.(sceneReady);
  });

  // The 2D animated backdrop keeps repainting a viewport-sized canvas behind
  // the opaque loading curtain, where nobody can see it, while GLB parsing,
  // geometry upload and shader compile need every millisecond of the main
  // thread. Fullscreen occludes it outright. Freeze rather than unmount: the
  // window is short and re-initializing costs more than it saves.
  //
  // The scene-ready flag is a first-load latch, so it covered only that boot.
  // Switching scenes runs the same pipeline again behind the same veil, and the
  // backdrop was painting through every frame of it — so the transition holds
  // too, from the moment it starts until it settles.
  const backgroundHoldKey = `viewer3d-boot:${nextViewer3DInstanceId()}`;
  $effect(() => {
    const shouldHold = !sceneReady || !environmentSettled || fullScreen;
    if (shouldHold) holdBackground(backgroundHoldKey);
    else releaseBackground(backgroundHoldKey);

    return () => {
      if (shouldHold) releaseBackground(backgroundHoldKey);
    };
  });

  // A host that exposes a shareable camera URL needs the settled orbit pose,
  // not a second set of camera controls. Viewer3DCamera records that pose after
  // the gesture ends; this forwards the existing snapshot through the public
  // callback that Viewer3DCanvas already advertises.
  $effect(() => {
    const snapshot = viewer3DState.cameraSnapshot;
    if (snapshot) onCameraStateChange?.(snapshot);
  });

  // Hold playback through every renderer preparation, including worker scene
  // swaps. Letting the shared clock and all of its DOM consumers keep repainting
  // while a replacement WebGL context uploads resources forced main-thread
  // layouts and made an otherwise off-thread switch feel locked. Preserve the
  // current beat and resume only after the complete replacement frame is live.
  let heldForSceneLoad = false;
  function synchronizeSceneLoadingPlayback(playing: boolean): void {
    if (onSystemPlaybackChange) {
      onSystemPlaybackChange(playing, "system_3d_loading");
    } else if (isPlaying !== playing) {
      // Backward-compatible fallback for hosts that only implement the legacy
      // toggle callback. Scan hosts provide the explicit non-counting sink.
      onPlaybackToggle?.();
    }
  }

  $effect(() => {
    if (initialRevealMode === "streaming") {
      if (heldForSceneLoad) synchronizeSceneLoadingPlayback(true);
      heldForSceneLoad = false;
      return;
    }
    const transition = sceneLoadingPlaybackTransition({
      sceneReady: sceneReady && environmentSettled,
      isPlaying,
      held: heldForSceneLoad,
    });
    heldForSceneLoad = transition.held;
    if (transition.syncTo !== null) {
      synchronizeSceneLoadingPlayback(transition.syncTo);
    }
  });

  function handleBeatPlaneStepClick(targetStep: number): void {
    const performer = characterState;
    if (!performer) return;
    selectBeatPlaneStep({
      currentStep: performer.currentStepIndex,
      targetStep,
      goToStep: (step) => performer.goToStep(step),
      onSettingChange,
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="viewer-3d-canvas"
  data-swipe-block
  data-renderer-backend={workerHostExact ? "worker" : "legacy"}
>
  {#if canRenderScene}
    <!-- The transport is a layout sibling of the stage, not an overlay: it
         takes real space at the bottom and the stage shrinks to fit, so the
         bar never covers the scene. The loading curtain stays parented to the
         root so it still covers the transport during the scene-load hold. -->
    <div class="stage-area">
      {#if renderEmptyScene || canvasMountReady || initialRevealMode === "streaming"}
        {#if workerHostExact && workerEnvironment && sequenceData && leftPropType && rightPropType}
          <WorkerViewer3DScene
            environment={workerEnvironment}
            {sequenceData}
            {currentStep}
            {isPlaying}
            {leftPropType}
            {rightPropType}
            {hideSceneMarkers}
            {hidePerformerBadges}
            {enableEffects}
            {enablePerformerLocomotion}
            effectQualityTier={effectQualityTier ?? adaptiveQuality.tier}
            renderQualityTier={adaptiveQuality.tier}
            {performerStepOffsets}
            {performerSteps}
            {visiblePerformerCount}
            pixelRatio={adaptiveQuality.pixelRatio}
            maxOrbitDistance={cameraMaxOrbitDistance}
            {cameraFov}
            conditions={workerConditions}
            onSnapshot={handleWorkerSnapshot}
            onFallback={failWorkerRenderer}
            onWorkerFrame={(deltaSeconds) =>
              adaptiveQuality.observeFrame(
                deltaSeconds,
                sceneReady &&
                  isPlaying &&
                  !viewer3DState.isExporting &&
                  (typeof document === "undefined" ||
                    document.visibilityState === "visible")
              )}
          />
        {:else}
          <Canvas
            dpr={adaptiveQuality.pixelRatio}
            shadows={adaptiveQuality.config.enableShadows}
            createRenderer={(canvas) =>
              new WebGLRenderer({ canvas, preserveDrawingBuffer: false })}
          >
            <InteractiveCanvasFrameBridge />
            <PerfMonitor
              visible={viewer3DState.showPerf}
              adaptive={sceneReady && isPlaying && !viewer3DState.isExporting}
              active={Boolean(onPerformanceSample) && sceneReady}
              warmupMs={performanceWarmupMs}
              onSample={onPerformanceSample}
            />
            <Viewer3DCanvasRef {onRendererReady} />
            <!-- Reads the legs every host in the app puts on screen. Renders
               nothing, and does not run at all unless the instrument was
               asked for with `?gait=1` or window.__gaitProbeEnabled. -->
            {#if gaitProbeState.enabled}
              <GaitProbe />
            {/if}
            {#if adaptiveQuality.initialized}
              <InteractivePropAssetWarmup
                onReadyChange={(ready) => (interactivePropsReady = ready)}
              />
              <SceneShaderWarmup
                onReadyChange={handleRendererReadyChange}
                waitForAllFeatures={initialRevealMode === "streaming"}
                cacheKey={shaderWarmupCacheKey}
                additionalReady={performersReady &&
                  interactivePropsReady &&
                  effectsRuntimeReady}
              />
              {#snippet sceneContent()}
                <Viewer3DCamera
                  cameraPlayerAvatar={cameraPlayer.avatarState}
                  cameraPlayerPhysics={cameraPlayer.physicsProvider}
                  {onSettingChange}
                  maxOrbitDistance={cameraMaxOrbitDistance}
                  fov={cameraFov}
                />
                <Viewer3DScene
                  {sequenceData}
                  {currentStep}
                  {isPlaying}
                  {characterState}
                  leftPropTypeOverride={leftPropType}
                  rightPropTypeOverride={rightPropType}
                  {hideSceneMarkers}
                  {hidePerformerBadges}
                  {hideOrientationHelpers}
                  {weldPerformerGrip}
                  {enableEffects}
                  {enablePerformerLocomotion}
                  {effectQualityTier}
                  {performerStepOffsets}
                  {performerSteps}
                  {worldChildren}
                  {visiblePerformerCount}
                  {stageBoundsPositions}
                  {stageExtent}
                  {retainedEnvironmentTypes}
                  {environmentTransitionVisualMode}
                  onPerformerReadinessChange={handlePerformerReadinessChange}
                  onEnvironmentTransitionChange={handleEnvironmentTransitionChange}
                  onEffectsRuntimeReadyChange={(ready) =>
                    (effectsRuntimeReady = ready)}
                />
              {/snippet}
              {@render sceneContent()}
              {#if enableEffects}
                {#await loadScenePostProcessing() then { default: ScenePostProcessing }}
                  <ScenePostProcessing />
                {/await}
              {/if}
            {/if}
          </Canvas>
        {/if}
      {/if}
      {#if sequenceData && !hideOverlays}
        {#await loadSceneAudioPlayer() then { default: SceneAudioPlayer }}
          <SceneAudioPlayer />
        {/await}
        {#if characterState && characterState.totalSteps > 1 && characterState.beatEditMode}
          <div class="beat-strip-container">
            {#await loadStepPlaneStrip() then { default: StepPlaneStrip }}
              <StepPlaneStrip
                totalSteps={characterState.totalSteps}
                currentStepIndex={characterState.currentStepIndex}
                beatPlaneOverrides={characterState.beatPlaneOverrides}
                onStepClick={handleBeatPlaneStepClick}
              />
            {/await}
          </div>
        {/if}
      {/if}
    </div>
    {#if sequenceData && initialRevealMode === "gated"}
      <SceneLoadingCurtain
        additionalRevealReady={performersReady}
        additionalRevealProgress={waitForPerformersOnInitialReveal
          ? performerRevealProgress
          : null}
        additionalRevealLabel="Dressing the cast"
      />
    {/if}
    {#if sequenceData && !hideOverlays}
      <div class="timeline-anchor">
        {#await loadUnifiedTimeline() then { default: UnifiedTimeline }}
          <UnifiedTimeline playback={playbackAdapter} />
        {/await}
      </div>
    {/if}
  {:else if initialRevealMode === "gated"}
    <div class="viewer-3d-loading">Loading 3D viewer...</div>
  {/if}

  <!-- The readout half. Lives out here rather than in the Canvas because it
       is DOM, and it renders nothing when the probe is off. -->
  <GaitOverlay />
</div>

<style>
  .viewer-3d-canvas {
    width: 100%;
    height: 100%;
    position: relative;
    background: #1a1a2e;
    display: flex;
    flex-direction: column;
  }

  .stage-area {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
  }

  .timeline-anchor {
    position: relative;
    flex: 0 0 auto;
    z-index: 20;
    pointer-events: auto;
  }

  .beat-strip-container {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    z-index: 10;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .beat-strip-container :global(.beat-plane-strip) {
    pointer-events: auto;
  }

  .viewer-3d-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.4);
    font-size: var(--font-size-min, 14px);
  }
</style>
