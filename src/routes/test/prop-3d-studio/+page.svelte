<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { CameraStateSnapshot } from "@austencloud/scene-3d";
  import { replaceState } from "$app/navigation";
  import { onDestroy, onMount, untrack } from "svelte";
  import { initializeAppServices } from "$lib/shared/application/state/services.svelte";

  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { setViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import {
    clearCameraUrlPose,
    readCameraUrlPose,
    setCameraUrlPose,
  } from "$lib/shared/3d/domain/camera-url-pose";
  import { createScene3DRenderState } from "$lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";
  import { setScene3DRenderContext } from "$lib/shared/3d/scene-features/state/scene-3d-render-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
  import SceneControlWorkspace from "$lib/shared/3d/components/controls/SceneControlWorkspace.svelte";
  import type { SceneControlLayout } from "$lib/shared/3d/domain/scene-control-layout";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import HorizontalTransportRow from "$lib/shared/sequence-viewer/components/HorizontalTransportRow.svelte";
  import TempoControl from "$lib/shared/animation-panel/components/TempoControl.svelte";
  import {
    LOOPType,
    Period,
  } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import type {
    DifficultyLevel,
    GenerationMode,
    PropContinuity,
  } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { SCENE_PROP_TYPES } from "$lib/shared/3d/domain/scene-prop-catalog";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { isEffectPreviewLoop } from "$lib/shared/effects/domain/effect-preview-loop-policy";
  import { DURATION } from "$lib/shared/transitions/transitions";

  type Viewer3DCanvasComponent =
    typeof import("$lib/shared/3d/components/Viewer3DCanvas.svelte").default;

  type ReviewAngle =
    | "front"
    | "three-quarter"
    | "profile"
    | "back"
    | "top"
    | "detail";

  interface ReviewCamera {
    id: ReviewAngle;
    label: string;
    position: CameraStateSnapshot["position"];
    target: CameraStateSnapshot["target"];
  }

  // The prop is the subject of this studio. Blossom remains enabled and loads
  // into the already-visible sky and stage, but its 14 MB grove no longer keeps
  // the performer and controls behind the loading curtain.
  const INITIAL_REVEAL_DEFERRED_FEATURES = ["environment"] as const;
  const ROTATED_LOOP_CACHE_KEY = "prop-studio:rotated-loop:v1";
  const CIRCULAR_MODE = "circular" as GenerationMode;
  const INTERMEDIATE_DIFFICULTY = "intermediate" as DifficultyLevel;
  const CONTINUOUS_PROPS = "continuous" as PropContinuity;

  const REVIEW_CAMERAS: readonly ReviewCamera[] = [
    {
      id: "front",
      label: "Front",
      position: { x: 0, y: 0.3, z: -3.75 },
      target: { x: 0, y: 0.15, z: 0.1 },
    },
    {
      id: "three-quarter",
      label: "Three-quarter",
      position: { x: 2.65, y: 0.45, z: -2.65 },
      target: { x: 0, y: 0.15, z: 0.1 },
    },
    {
      id: "profile",
      label: "Profile",
      position: { x: 3.75, y: 0.3, z: 0 },
      target: { x: 0, y: 0.15, z: 0.1 },
    },
    {
      id: "back",
      label: "Back",
      position: { x: 0, y: 0.3, z: 3.75 },
      target: { x: 0, y: 0.15, z: 0.1 },
    },
    {
      id: "top",
      label: "Top",
      position: { x: 0, y: 4.65, z: -0.2 },
      target: { x: 0, y: -0.25, z: 0.15 },
    },
    {
      id: "detail",
      label: "Grip detail",
      position: { x: 1.35, y: 0.75, z: -1.85 },
      target: { x: 0, y: 0.6, z: 0.05 },
    },
  ];

  function isReviewProp(value: string | null): value is PropType {
    return SCENE_PROP_TYPES.some((prop) => prop === value);
  }

  /**
   * Read the deep link BEFORE the viewer is constructed. Viewer3DCamera reads
   * `DEFAULT_CAMERA` when it mounts, so seeding it from the URL is what keeps
   * `?angle=top` from mounting three-quarter and then popping to the top view.
   */
  function readParam(key: string): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(key);
  }

  const requestedProp = readParam("prop");
  const requestedAngle = readParam("angle");
  const requestedCameraPose =
    typeof window === "undefined"
      ? null
      : readCameraUrlPose(new URLSearchParams(window.location.search), 48);
  const initialProp = isReviewProp(requestedProp)
    ? requestedProp
    : PropType.CHICKEN;
  const initialCamera =
    REVIEW_CAMERAS.find((camera) => camera.id === requestedAngle) ??
    REVIEW_CAMERAS[1];

  const DEFAULT_CAMERA: CameraStateSnapshot = {
    position: requestedCameraPose?.position ?? initialCamera.position,
    rotation: { x: 0, y: 0, z: 0 },
    target: requestedCameraPose?.target ?? initialCamera.target,
    fov: requestedCameraPose?.fov ?? 48,
    timestamp: 0,
  };

  const viewer = createViewer3DState({
    renderMode: "3d",
    backgroundType: BackgroundType.BLOSSOM,
    camera: DEFAULT_CAMERA,
    performers: [],
    selectedPerformerIndex: 0,
    activeFormation: "line",
    defaultProp: initialProp,
    visiblePlanes: [],
    effectToggles: {},
    sceneFeatures: {
      environment: true,
      stage: false,
      audience: false,
      campfire: false,
      tent: false,
    },
  });
  viewer.hideAllPlanes();
  setViewer3DContext(viewer);

  // The standalone-host recipe the composer demo established: this route has no
  // app shell, so it provides the contexts the rail's tools expect itself. The
  // effects config is non-persisting on purpose — a review session must not
  // write back into the visitor's saved effect setup.
  setEffectsConfigContext(
    createEffectsConfigState(undefined, { persist: false })
  );
  setScene3DRenderContext(createScene3DRenderState());

  let activeAngle = $state<ReviewAngle>(initialCamera.id);
  /**
   * Set the moment the user grabs the scene. While it is set, nothing on this
   * page is allowed to move the camera — a generated LOOP runs out every ~12s
   * and the swap used to re-apply the active preset, which threw away the orbit
   * the user was in the middle of reading a prop from.
   */
  let cameraIsFree = $state(requestedCameraPose !== null);
  /**
   * The app's playback clock, not a local one. It owns the invariant this page
   * used to get wrong: step N's motion spans currentStep N to N+1, so a
   * 16-count LOOP has to reach 17 before it has actually played its closing
   * step, and a seamless LOOP skips the start-placement hold on every pass after
   * the first. The hand-rolled counter that wrapped at `steps.length` from zero
   * paid a dead beat at the top and then cut the motion that returns the props
   * to where they started -- the LOOP never closed.
   *
   * `ephemeral` keeps this harness out of the global speed and loop
   * preferences, and the shared-workspace sink is off so a review LOOP cannot
   * light up the beat grid of whatever sequence Create has open behind it.
   */
  const animation = createAnimationPanelState({ ephemeral: true });
  let bpm = $state(76);
  let sceneReady = $state(false);
  let ViewerCanvasComponent = $state<Viewer3DCanvasComponent | null>(null);
  let playback = $state<AnimationPlaybackController | null>(null);
  let viewerModuleSettled = $state(false);
  let initialSequenceSettled = $state(false);
  let error = $state("");
  let loopNumber = $state(0);
  let viewportWidth = $state(1600);
  let viewportHeight = $state(900);
  let generationToken = 0;
  let playbackLoadPromise: Promise<AnimationPlaybackController> | null = null;

  const sequence = $derived(animation.sequenceData);
  const loading = $derived(!viewerModuleSettled || !initialSequenceSettled);
  const currentStep = $derived(animation.currentStep);
  const playing = $derived(animation.isPlaying);

  /**
   * The prop on stage, read from the performer the rail actually edits rather
   * than shadowed in a local copy. Nothing on this page sets a prop override on
   * the canvas any more, so the picker inside the Performers tool is the single
   * writer and this is its mirror — the title and the `?prop=` deep link follow
   * the scene instead of racing it.
   */
  const selectedProp = $derived<PropType>(
    viewer.performerManager.performers[0]?.effectiveProp ??
      viewer.defaultSettings.prop ??
      initialProp
  );
  const selectedLabel = $derived(getPropTypeDisplayInfo(selectedProp).label);

  /** Which presentation the shared rail resolved to, so the transport dock
   *  knows whether a right-hand rail is occupying the stage edge. */
  let controlPresentation = $state<SceneControlLayout["presentation"]>("docked");
  /** Measured so the rail and its inspector stop exactly above the dock. */
  let dockHeight = $state(96);
  let titleHeight = $state(52);
  /** Mirrors `.title-block`'s `top: clamp(18px, 3cqh, 34px)` — `.studio` is
   *  fixed to the viewport, so cqh and vh are the same number here. */
  const titleTop = $derived(Math.min(34, Math.max(18, viewportHeight * 0.03)));
  const railTopOffset = $derived(
    `${Math.round(titleTop + titleHeight + 14)}px`
  );
  /** Mirrors `.transport-dock`'s `bottom: clamp(12px, 2.4cqh, 28px)`. The rail
   *  has to clear the dock's TOP edge, which is that inset plus its height —
   *  clearing the height alone left the inspector overlapping the dock's
   *  corner by the inset's own few pixels. */
  const dockInset = $derived(Math.min(28, Math.max(12, viewportHeight * 0.024)));
  const railBottomOffset = $derived(
    `${Math.round(dockHeight + dockInset + 10)}px`
  );

  function syncUrl(): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("prop", selectedProp);
    if (cameraIsFree) {
      url.searchParams.delete("angle");
    } else {
      url.searchParams.set("angle", activeAngle);
      clearCameraUrlPose(url);
    }
    replaceState(url, {});
  }

  function syncFreeCameraToUrl(snapshot: CameraStateSnapshot): void {
    if (typeof window === "undefined" || !cameraIsFree) return;
    const url = new URL(window.location.href);
    url.searchParams.set("prop", selectedProp);
    url.searchParams.delete("angle");
    setCameraUrlPose(url, snapshot);

    // This page reads its starting camera before constructing the viewer rather
    // than reacting to every URL change, so the router-safe replacement lets the
    // URL follow the view without feeding rounded coordinates back into it.
    replaceState(url, {});
  }

  function applyCamera(): void {
    if (!sceneReady || cameraIsFree) return;
    const camera = REVIEW_CAMERAS.find(
      (candidate) => candidate.id === activeAngle
    );
    if (!camera) return;

    const compact = viewportWidth < 760 || viewportHeight < 560;
    const distanceScale = compact ? 1.3 : 1;
    viewer.snapCameraTo(
      {
        x: camera.position.x * distanceScale,
        y: camera.position.y * distanceScale,
        z: camera.position.z * distanceScale,
      },
      camera.target,
      undefined,
      false
    );
  }

  /**
   * A DRAG or a wheel over the scene means the camera is the user's now — not a
   * bare click, which moves nothing and shouldn't drop the active preset.
   */
  let dragOrigin: { x: number; y: number } | null = null;

  function sceneDragStart(event: PointerEvent): void {
    dragOrigin = { x: event.clientX, y: event.clientY };
  }

  function sceneDragMove(event: PointerEvent): void {
    if (!dragOrigin) return;
    const moved = Math.hypot(
      event.clientX - dragOrigin.x,
      event.clientY - dragOrigin.y
    );
    if (moved <= 4) return;
    dragOrigin = null;
    cameraIsFree = true;
  }

  function sceneDragEnd(): void {
    dragOrigin = null;
  }

  async function generateRotatedLoop(): Promise<SequenceData> {
    const [{ getGenerationOrchestrator }, { orientationCycleExtender }] =
      await Promise.all([
        import("$lib/features/create/generate/shared/get-generation-orchestrator"),
        import("$lib/features/create/generate/circular/services/orientation-cycle-extender"),
      ]);
    const generated = await getGenerationOrchestrator().generateSequence({
      mode: CIRCULAR_MODE,
      length: 16,
      gridMode: GridMode.DIAMOND,
      propType: PropType.STAFF,
      difficulty: INTERMEDIATE_DIFFICULTY,
      propContinuity: CONTINUOUS_PROPS,
      turnIntensity: 1,
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
    });
    const extended = orientationCycleExtender.extendIfNeeded(generated);
    if (!isEffectPreviewLoop(extended)) {
      throw new Error("The generated motion did not close cleanly.");
    }
    cacheRotatedLoop(extended);
    return extended;
  }

  /**
   * The production playback owner is still used here, but it does not belong
   * on the route's critical import path. Its orchestrator reaches application
   * settings, which in turn reaches persistence, auth, analytics, and presence.
   * Starting that branch beside the viewer makes refresh pay both costs once,
   * concurrently, instead of waiting for the whole app branch before the 3D
   * branch can even begin.
   */
  function loadPlaybackController(): Promise<AnimationPlaybackController> {
    playbackLoadPromise ??= Promise.all([
      import("$lib/shared/animation-engine/services/animation-playback-controller"),
      import("$lib/shared/animation-engine/services/animation-loop"),
      import("$lib/shared/animation-engine/services/animation-state-manager"),
      import("$lib/shared/animation-engine/services/sequence-animation-orchestrator"),
    ]).then(
      ([
        { AnimationPlaybackController },
        { AnimationLoop },
        { AnimationStateManager },
        { SequenceAnimationOrchestrator },
      ]) =>
        new AnimationPlaybackController(
          new SequenceAnimationOrchestrator(new AnimationStateManager()),
          new AnimationLoop(),
          { syncSharedWorkspaceState: false }
        )
    );

    return playbackLoadPromise;
  }

  /**
   * A refresh should not pay for Create's generator graph and produce a second
   * random LOOP before the studio can open. Only validated, JSON-safe preview
   * loops cross this boundary; corrupt or stale entries are discarded and the
   * normal generator path takes over.
   */
  function readCachedRotatedLoop(): SequenceData | null {
    if (typeof window === "undefined") return null;

    try {
      const serialized = sessionStorage.getItem(ROTATED_LOOP_CACHE_KEY);
      if (!serialized) return null;
      const cached = JSON.parse(serialized) as SequenceData;
      if (isEffectPreviewLoop(cached)) return cached;
      sessionStorage.removeItem(ROTATED_LOOP_CACHE_KEY);
    } catch {
      sessionStorage.removeItem(ROTATED_LOOP_CACHE_KEY);
    }

    return null;
  }

  function cacheRotatedLoop(sequence: SequenceData): void {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.setItem(ROTATED_LOOP_CACHE_KEY, JSON.stringify(sequence));
    } catch {
      // Storage can be unavailable or full. Generation still succeeded, so the
      // studio remains usable and simply regenerates on the next refresh.
    }
  }

  /** Start a LOOP from the top. The first one, and the deck's own swap button. */
  function installSequence(next: SequenceData): void {
    if (!playback?.initialize(next, animation)) {
      error = "The generated motion could not be played.";
      return;
    }
    animation.setShouldLoop(true);
    playback.setSpeed(bpm / 60);
    loopNumber += 1;
    playback.togglePlayback();
    // Deliberately does NOT touch the camera. `enter3D` leaves it alone, so the
    // view survives the swap — which is the whole point of the fix.
  }

  // A validated LOOP repeats itself. Never replace it at a playback boundary:
  // two independently closed LOOPs can still begin from different poses.
  async function advanceLoop(): Promise<void> {
    try {
      const [next, controller] = await Promise.all([
        generateRotatedLoop(),
        loadPlaybackController(),
      ]);
      playback ??= controller;
      installSequence(next);
      error = "";
    } catch (cause: unknown) {
      error =
        cause instanceof Error
          ? cause.message
          : "A new LOOP could not be generated.";
    }
  }

  /**
   * The avatar builds its own step configs, so every sequence the clock accepts
   * has to reach the viewer -- the first one, a button swap, and the ones the
   * boundary hand-off installs without this page ever calling a function.
   */
  $effect(() => {
    const next = animation.sequenceData;
    if (!next) return;
    untrack(() => {
      viewer.enter3D(next);
      viewer.hideAllPlanes();
    });
  });

  /** Tempo is the clock's, not a number this page multiplies by itself. */
  $effect(() => {
    playback?.setSpeed(bpm / 60);
  });

  /**
   * The shareable link follows whatever prop the rail put on stage. Guarded on
   * an actual change, not merely on the effect running: the first pass happens
   * during mount, when the value still matches the URL it was read from and
   * `replaceState` would throw for being called before the router initializes.
   */
  let lastSyncedProp: PropType = initialProp;
  $effect(() => {
    const prop = selectedProp;
    if (prop === lastSyncedProp) return;
    lastSyncedProp = prop;
    untrack(syncUrl);
  });

  function handleBpmChange(nextBpm: number): void {
    bpm = nextBpm;
  }

  function handleSceneReady(ready: boolean): void {
    sceneReady = ready;
    applyCamera();
  }

  $effect(() => {
    void viewportWidth;
    void viewportHeight;
    applyCamera();
  });

  onMount(() => {
    // Settings-backed picker rows (fan appearance, triangle grip) write through
    // updateSettings, which is a no-op until the settings service exists. The
    // app shell does this through MainApplication; /test/* routes have to do it
    // themselves, as SequenceViewerTransitionReviewFrame does.
    void initializeAppServices();
    const token = ++generationToken;
    const cachedSequence = readCachedRotatedLoop();
    const initialSequencePromise = cachedSequence
      ? Promise.resolve(cachedSequence)
      : generateRotatedLoop();

    void import("$lib/shared/3d/components/Viewer3DCanvas.svelte")
      .then(({ default: component }) => {
        if (token !== generationToken) return;
        ViewerCanvasComponent = component;
        viewerModuleSettled = true;
      })
      .catch((cause: unknown) => {
        if (token !== generationToken) return;
        viewerModuleSettled = true;
        error =
          cause instanceof Error
            ? cause.message
            : "The 3D viewer could not be loaded.";
      });

    void Promise.all([loadPlaybackController(), initialSequencePromise])
      .then(([controller, initial]) => {
        if (token !== generationToken) return;
        playback = controller;
        installSequence(initial);
        initialSequenceSettled = true;
      })
      .catch((cause: unknown) => {
        if (token !== generationToken) return;
        initialSequenceSettled = true;
        error =
          cause instanceof Error
            ? cause.message
            : "The first LOOP could not be prepared.";
      });
  });

  onDestroy(() => {
    generationToken += 1;
    playback?.dispose(animation);
    animation.dispose();
    viewer.dispose();
  });
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<svelte:head>
  <title>3D prop studio</title>
  <meta
    name="description"
    content="Inspect and configure real 3D props while a performer cycles through generated rotated LOOPs."
  />
</svelte:head>

<main
  class="studio"
  data-prop-studio-ready={sceneReady && sequence ? "true" : "false"}
  data-prop-studio-prop={selectedProp}
  data-prop-studio-angle={activeAngle}
  data-prop-studio-loop={loopNumber}
  data-prop-studio-step={currentStep.toFixed(3)}
  data-prop-studio-total={animation.totalSteps}
>
  <section class="stage" aria-label="Live 3D prop review">
    {#if sequence && ViewerCanvasComponent}
      <!--
        The wrapper exists so a drag or wheel on the SCENE marks the camera as
        the user's, while the rail and dock layered over it do not.
      -->
      <div
        class="canvas-holder"
        onpointerdown={sceneDragStart}
        onpointermove={sceneDragMove}
        onpointerup={sceneDragEnd}
        onpointercancel={sceneDragEnd}
        onwheel={() => (cameraIsFree = true)}
      >
        <!-- No blue/red prop override: an override wins over each performer's
             own prop, which would leave the rail's prop picker with no effect. -->
        <ViewerCanvasComponent
          sequenceData={sequence}
          {currentStep}
          isPlaying={playing}
          {bpm}
          hideOverlays
          enableEffects={false}
          initialRevealDeferredFeatures={INITIAL_REVEAL_DEFERRED_FEATURES}
          onSceneReadyChange={handleSceneReady}
          onCameraStateChange={syncFreeCameraToUrl}
        />
      </div>
    {/if}

    <div class="stage-shade" aria-hidden="true"></div>

    <header class="title-block" bind:clientHeight={titleHeight}>
      <Crossfade key={selectedLabel} duration={DURATION.normal}>
        <h1>{selectedLabel}</h1>
      </Crossfade>
    </header>

    {#if loading}
      <div class="status-card" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <strong>Generating the first LOOP</strong>
      </div>
    {:else if error}
      <div class="status-card error" role="alert">
        <strong>Motion generation stopped</strong>
        <span>{error}</span>
        <button type="button" onclick={() => void advanceLoop()}
          >Try again</button
        >
      </div>
    {/if}

    <!--
      The same right-hand rail every other 3D stage carries. Props are chosen
      inside its Performers tool, which is the whole point: the studio reaches
      the app's real Performers, Formation, Camera, and Scene tools instead of
      owning a second, differently-shaped prop deck across the bottom of a 4K
      screen. Save scene is off — this harness has no collection to save into.
    -->
    {#if sequence && ViewerCanvasComponent}
      <SceneControlWorkspace
        allowSaveScene={false}
        {bpm}
        isPlaying={playing}
        onPlaybackToggle={() => playback?.togglePlayback()}
        onStepForward={() => playback?.stepFullBeatForward()}
        onStepBackward={() => playback?.stepFullBeatBackward()}
        topOffset={railTopOffset}
        bottomOffset={railBottomOffset}
        onLayoutChange={(layout) =>
          (controlPresentation = layout.presentation)}
      />
    {/if}

    <!--
      Content-sized, so it stays a cluster rather than a band: the canonical
      viewer transport with the studio's own tempo and LOOP swap beside it.
      `rail-clear` keeps it out from under the docked rail; in the compact
      presentation the rail is a bottom bar that sits above this dock instead.
    -->
    <div
      class="transport-dock"
      class:rail-clear={controlPresentation !== "compact"}
      bind:clientHeight={dockHeight}
    >
      <TempoControl
        {bpm}
        onBpmChange={handleBpmChange}
        showPractice={false}
        presetsMode="popover"
      />
      <HorizontalTransportRow
        isPlaying={playing}
        onPlaybackToggle={() => playback?.togglePlayback()}
        onRestartToStart={() => playback?.jumpToStep(0)}
        onStepFullFwd={() => playback?.stepFullBeatForward()}
      />
      <button
        class="new-loop-button"
        type="button"
        onclick={() => void advanceLoop()}
      >
        <i class="fas fa-rotate" aria-hidden="true"></i>
        <span>New LOOP</span>
      </button>
    </div>
  </section>
</main>

<style>
  .studio {
    --studio-panel: var(--theme-panel-bg, rgba(12, 15, 24, 0.96));
    --studio-card: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    --studio-stroke: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    --studio-accent: var(--theme-accent, #67a8ff);
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    background: #070911;
    color: var(--theme-text, #f6f7fb);
    container-type: size;
  }

  .stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .canvas-holder {
    position: absolute;
    inset: 0;
  }

  .stage-shade {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(4, 6, 12, 0.3), transparent 20%),
      linear-gradient(0deg, rgba(4, 6, 12, 0.72), transparent 32%);
  }

  .title-block {
    position: absolute;
    top: clamp(18px, 3cqh, 34px);
    left: clamp(18px, 3cqw, 42px);
    pointer-events: none;
  }

  h1 {
    margin: 0;
    font-size: clamp(30px, 3cqw, 52px);
    line-height: 1;
    letter-spacing: -0.035em;
  }

  /*
    A cluster, not a band. It sizes to its three controls and centres in the
    stage area the rail leaves free, so a 3840px screen shows the same dock a
    1440px one does rather than a strip of empty panel stretched wall to wall.
  */
  .transport-dock {
    --studio-control-size: 50px;
    position: absolute;
    right: 0.75rem;
    bottom: clamp(12px, 2.4cqh, 28px);
    left: 0.75rem;
    z-index: 21;
    display: flex;
    align-items: center;
    gap: clamp(12px, 1.5cqw, 28px);
    width: max-content;
    max-width: calc(100% - 1.5rem);
    margin-inline: auto;
    padding: 12px 16px;
    border: 1px solid var(--studio-stroke);
    border-radius: var(--settings-border-radius-lg, 16px);
    background: var(--studio-panel);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.36);
  }

  /* The docked rail owns 4.75rem of the right edge; the dock centres in what
     is left rather than sliding underneath it. */
  .transport-dock.rail-clear {
    right: 5.5rem;
    max-width: calc(100% - 6.25rem);
  }

  .transport-dock :global(.tempo-control) {
    --min-touch-target: var(--studio-control-size);
    justify-content: flex-start;
  }

  .transport-dock :global(.horizontal-transport-row) {
    flex: 0 0 auto;
  }

  button {
    min-height: 44px;
    padding: 9px 13px;
    border: 1px solid var(--studio-stroke);
    border-radius: var(--settings-border-radius-md, 10px);
    background: var(--studio-card);
    color: rgba(255, 255, 255, 0.78);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
    transition:
      transform var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
      color: #fff;
      transform: translateY(-1px);
    }
  }

  button:focus-visible {
    outline: 2px solid var(--studio-accent);
    outline-offset: 2px;
  }

  /* The BPM editor opens upward: this dock is pinned to the bottom edge, so a
     popover that grows downward would be off-screen. */
  .transport-dock :global(.tempo-wrapper) {
    position: relative;
  }

  .transport-dock :global(.bpm-popover) {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 0;
    z-index: 2;
    min-width: 280px;
  }

  .transport-dock :global(.adjust-btn) {
    border-color: color-mix(in srgb, var(--studio-accent) 30%, transparent);
    background: color-mix(in srgb, var(--studio-accent) 8%, var(--studio-card));
    color: rgba(255, 255, 255, 0.82);
  }

  .transport-dock :global(.bpm-display) {
    min-width: 82px;
    min-height: calc(var(--studio-control-size) + 4px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .new-loop-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: calc(var(--studio-control-size) + 4px);
    padding-inline: 20px;
    border-color: color-mix(in srgb, var(--studio-accent) 58%, white);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--studio-accent) 30%, var(--studio-card)),
      color-mix(in srgb, var(--studio-accent) 16%, var(--studio-card))
    );
    color: #fff;
    box-shadow:
      0 7px 20px color-mix(in srgb, var(--studio-accent) 18%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .new-loop-button i {
    color: color-mix(in srgb, var(--studio-accent) 68%, white);
    font-size: 1rem;
  }

  @media (hover: hover) and (pointer: fine) {
    .new-loop-button:hover {
      border-color: color-mix(in srgb, var(--studio-accent) 80%, white);
      background: linear-gradient(
        145deg,
        color-mix(in srgb, var(--studio-accent) 40%, var(--studio-card)),
        color-mix(in srgb, var(--studio-accent) 22%, var(--studio-card))
      );
      box-shadow:
        0 10px 26px color-mix(in srgb, var(--studio-accent) 28%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.18);
    }
  }

  .status-card {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: min(430px, calc(100vw - 32px));
    padding: 16px 18px;
    border: 1px solid var(--studio-stroke);
    border-radius: var(--settings-border-radius-lg, 16px);
    background: var(--studio-panel);
    transform: translate(-50%, -50%);
    font-size: var(--font-size-min, 14px);
  }

  .status-card.error {
    flex-wrap: wrap;
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef596f) 60%,
      transparent
    );
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.18);
    border-top-color: var(--studio-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /*
    At 4K@100% nothing is scaling for you, so the dock steps up with the stage.
    Placed after the base `button` rule on purpose — a container query carries no
    extra specificity, so an earlier block would simply lose to it.
  */
  @container (min-width: 2600px) {
    .transport-dock {
      --studio-control-size: 60px;
      padding: 18px 24px;
    }

    button {
      min-height: 56px;
      padding: 11px 16px;
      font-size: 18px;
    }

    .transport-dock :global(.play-btn) {
      width: 84px;
      height: 84px;
    }

    /* 3cqw would have carried the title here on its own, but the clamp ceiling
       lands first; on a 3840px canvas 52px reads as a caption. */
    h1 {
      font-size: 78px;
    }
  }

  /* Narrow or short: the LOOP swap keeps its icon and drops its word, and the
     dock stops reserving the rail's edge because the rail is a bottom bar
     there. Two lines of controls in a 412px-tall window is not a dock. */
  @container (max-width: 760px), (max-height: 620px) {
    .title-block {
      max-width: calc(100% - 36px);
    }

    .transport-dock {
      --studio-control-size: 44px;
      gap: 8px 10px;
      padding: 8px 10px;
    }

    .transport-dock :global(.bpm-display) {
      min-width: 64px;
    }

    /* The play button deliberately does NOT shrink with this tier. It carries
       its own 64px min-width as a touch-target floor, and it is the primary
       control on the smallest screen the dock renders on — the 12px of dock
       height a smaller one would return is not worth spending it on. */

    .new-loop-button span {
      display: none;
    }
  }

  /* Tempo plus a three-button transport plus the swap is ~410px of controls.
     Narrower than that the dock wraps rather than pushing its last two buttons
     off the right edge — every control stays reachable, and the rail's own bar
     rides up because it follows the measured dock height. Keyed to width only:
     a folded phone in landscape is short but 960px wide, and wrapping there
     would spend two rows of a 412px-tall window for nothing. */
  @container (max-width: 620px) {
    .transport-dock {
      flex-wrap: wrap;
      justify-content: center;
    }

    /* Wrapped, tempo owns a line to itself and grows into all of it, which
       left-hugs the BPM stepper against a half-row of empty dock while the
       transport below is centred — two rows that read as unrelated. Content-
       sized and centred, the two lines share one axis. */
    .transport-dock :global(.tempo-wrapper) {
      flex: 0 0 auto;
    }

    .transport-dock :global(.tempo-control) {
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
