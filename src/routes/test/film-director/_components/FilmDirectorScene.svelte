<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";

  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { resolveFilmDirectorEffectQualityTier } from "../_lib/film-director-performance-policy";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";

  import { getFilmDirectorContext } from "../_lib/film-director-context";
  import {
    applyDirectorCameraFrame,
    applyDirectorEffectPresets,
    applyDirectorPerformerMotion,
    applyDirectorSceneToViewer,
    applyDirectorStepChanges,
    buildDirectorViewerSeed,
    type DirectorAppliedStepChange,
  } from "../_lib/director-viewer-adapter";
  import { resolveHeldStep } from "../_lib/director-step-holds";
  import { sampleDirectorBlockingTrack } from "../_lib/director-blocking-track";
  import { getPreviewCameraFov } from "../_lib/director-camera-track";
  import { createDirectorSequenceLibrary } from "../_lib/director-sequence-library";
  import { createFilmDirectorTransitionProfiler } from "../_lib/film-director-transition-profiler.svelte";
  import { createFilmDirectorWarmupPlan } from "../_lib/film-director-warmup-plan";
  import { getSceneEnvironmentRendererKey } from "#lib/shared/3d/environments/domain/scene-environment.js";
  import type { EnvironmentTransitionObservation } from "#lib/shared/3d/environments/domain/environment-transition.js";
  import type { BackgroundType } from "@austencloud/backgrounds";
  import type { ResolvedDirectorScene } from "../_lib/film-director-schema";
  import SceneControlWorkspace from "#lib/shared/3d/components/controls/SceneControlWorkspace.svelte";
  import type { PerformerHubEdit } from "#lib/shared/3d/components/controls/performer-hub-types.js";
  import type { SceneControlTool } from "#lib/shared/3d/domain/scene-control-layout.js";
  import FilmDirectorCapabilityPanel from "./FilmDirectorCapabilityPanel.svelte";

  const director = getFilmDirectorContext();
  const sequence = demoSequenceJson as unknown as SequenceData;
  const firstScene = director.film.scenes[0]!;
  const reservedPerformerCount = $derived(
    Math.max(
      ...director.film.scenes.map(
        (scene) => scene.performance.performers.length
      )
    )
  );
  const retainedEnvironmentTypes = $derived(
    Array.from(
      new Set(
        director.film.scenes.map((scene) =>
          getSceneEnvironmentRendererKey(scene.location.environmentId)
        )
      )
    )
  );
  const sceneFeatures = createSceneFeatureState(
    firstScene.location.sceneFeatures,
    {
      isolated: true,
    }
  );
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  const viewer = createViewer3DState(buildDirectorViewerSeed(firstScene));
  const transitionProfiler = createFilmDirectorTransitionProfiler();
  const sequenceLibrary = createDirectorSequenceLibrary(sequence);
  if (typeof window !== "undefined") {
    // Test-route debug hook: lets an agent or a DevTools session inspect the
    // live viewer (camera pose, performer world positions) without UI.
    (window as unknown as Record<string, unknown>).__filmDirectorViewer =
      viewer;
    (window as unknown as Record<string, unknown>).__filmDirector = director;
  }

  setSceneFeatureContext(sceneFeatures);
  setEffectsConfigContext(effectsConfig);
  setViewer3DContext(viewer);
  viewer.enter3D(sequence);
  viewer.hideAllPlanes();

  let appliedSceneId = "";
  // Plain let, like appliedSceneId: applyScene reads and writes viewer state,
  // so an effect that tracked this guard would re-run on its own writes.
  let appliedEditRevision = director.editRevision;
  let warmupCursor = $state(0);
  let acknowledgedWarmupCursor = $state(-1);
  let initialSceneReady = $state(false);
  let latestEnvironmentTransition =
    $state<EnvironmentTransitionObservation<BackgroundType> | null>(null);
  let snapshotCanvas: HTMLCanvasElement;
  let snapshotVisible = $state(false);
  let snapshotFading = $state(false);
  let snapshotOpacity = $state(0);
  let snapshotDurationMs = $state(0);
  let activeTransitionToken = 0;
  let observedPreparationRevision = director.preparationRevision;
  let sceneElement: HTMLDivElement;
  let viewportAspectRatio = $state(
    director.film.format.width / director.film.format.height
  );
  const warmupPlan = $derived(
    createFilmDirectorWarmupPlan(
      director.film.scenes.length,
      undefined,
      director.warmupSceneIndex
    )
  );
  const presentedScene = $derived(
    director.preparation.complete
      ? director.frame.scene
      : director.film.scenes[warmupPlan[warmupCursor] ?? 0]!
  );
  const presentedStepOffsets = $derived(
    director.preparation.complete
      ? director.frame.performerStepOffsets
      : presentedScene.performance.performers.map(
          (performer) => performer.beatOffset
        )
  );
  /**
   * Each performer's own playhead once their holds are applied, or null for a
   * performer who states none — null falls through to the viewer's shared
   * clock plus `performerStepOffsets`, so a film with no holds drives the
   * viewer exactly as it did before this existed.
   *
   * The fractional value is deliberate: `Viewer3DScene` floors it for
   * `goToStep` and passes the remainder to `setProgress`, so one number pins
   * both the step and how far into it the performer sits.
   *
   * Sequence length is unknown here — the sequence lives in the viewer — so
   * `resolveHeldStep` is called with 0 and the viewer's
   * `resolvePerformerStepSource` does the wrapping it already does.
   */
  const presentedHeldSteps = $derived(
    presentedScene.performance.performers.map((performer, index) => {
      if (performer.holds.length === 0) return null;
      const shared = director.preparation.complete
        ? director.frame.sequenceStep
        : 0;
      const whole = Math.floor(shared);
      const held = resolveHeldStep(
        whole,
        shared - whole,
        presentedStepOffsets[index] ?? 0,
        performer.holds,
        0
      );
      return held.step + held.progress;
    })
  );

  /**
   * The step each performer's per-step effect and effort read from: the held
   * playhead where one exists, the shared clock plus their offset where it
   * does not.
   */
  const presentedEffectiveSteps = $derived(
    presentedScene.performance.performers.map((_, index) => {
      const held = presentedHeldSteps[index];
      if (held !== null && held !== undefined) return held;
      const shared = director.preparation.complete
        ? director.frame.sequenceStep
        : 0;
      return shared + (presentedStepOffsets[index] ?? 0);
    })
  );

  /** Last per-step effect/effort written per performer id — see applyDirectorStepChanges. */
  const appliedStepChanges = new Map<string, DirectorAppliedStepChange>();

  // Warmup renders a scene the playhead is not on, so its cast stands at its
  // own opening marks rather than wherever scene one's track happens to be.
  const presentedMotion = $derived(
    director.preparation.complete
      ? director.frame.performerMotion
      : presentedScene.performance.performers.map((performer) =>
          sampleDirectorBlockingTrack(performer.blocking, 0)
        )
  );
  const previewCameraFov = $derived(
    getPreviewCameraFov(
      director.frame.camera.fovDeg,
      director.film.format.width / director.film.format.height,
      viewportAspectRatio
    )
  );
  const effectQualityTier = $derived(
    resolveFilmDirectorEffectQualityTier(
      presentedScene.performance.performers.length
    )
  );

  function tryAdvanceWarmup(): void {
    if (director.preparation.complete || !initialSceneReady) return;
    if (acknowledgedWarmupCursor === warmupCursor) return;

    const transition = latestEnvironmentTransition;
    const expectedEnvironment = getSceneEnvironmentRendererKey(
      presentedScene.location.environmentId
    );
    if (
      !transition?.settled ||
      transition.mountedKey !== expectedEnvironment ||
      transition.requestedKey !== expectedEnvironment
    ) {
      return;
    }

    acknowledgedWarmupCursor = warmupCursor;
    if (warmupCursor >= warmupPlan.length - 1) {
      director.completePreparation();
      director.setSceneReady(true);
      return;
    }

    warmupCursor += 1;
    const nextSceneIndex = warmupPlan[warmupCursor] ?? 0;
    director.setPreparationScene(
      nextSceneIndex,
      Math.min(warmupCursor, director.preparation.totalSteps)
    );
  }

  function handleSceneReadyChange(ready: boolean): void {
    if (!ready) return;
    initialSceneReady = true;
    tryAdvanceWarmup();
  }

  function handleEnvironmentTransition(
    observation: EnvironmentTransitionObservation<BackgroundType>
  ): void {
    latestEnvironmentTransition = observation;
    transitionProfiler.observe(observation);
    tryAdvanceWarmup();
  }

  const afterPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  function capturePresentedFrame(): boolean {
    const source = viewer.webglCanvas;
    if (!source || !snapshotCanvas) return false;

    snapshotCanvas.width = source.width;
    snapshotCanvas.height = source.height;
    const context = snapshotCanvas.getContext("2d", { alpha: false });
    if (!context) return false;

    context.drawImage(source, 0, 0, source.width, source.height);
    return true;
  }

  function applyScene(scene: ResolvedDirectorScene): void {
    appliedSceneId = scene.id;

    // A cut re-establishes every performer from the scene document, so the
    // next frame must write its per-step values rather than trust what the
    // previous scene left in this map.
    appliedStepChanges.clear();

    for (const [feature, enabled] of Object.entries(
      scene.location.sceneFeatures
    )) {
      if (sceneFeatures.isEnabled(feature) !== enabled)
        sceneFeatures.toggle(feature);
    }
    applyDirectorSceneToViewer(viewer, scene, {
      reservedPerformerCount,
      sequences: sequenceLibrary.forScene(scene.id),
    });
    applyDirectorEffectPresets(effectsConfig, scene);
  }

  async function waitForIncomingFrame(
    token: number,
    scene: ResolvedDirectorScene,
    outgoingEnvironment: BackgroundType | null
  ): Promise<boolean> {
    const expectedEnvironment = getSceneEnvironmentRendererKey(
      scene.location.environmentId
    );

    // Two scenes can share one world: a film that ends in the room it opened
    // in, or a cut that only changes the cast. `Environment3D` publishes an
    // observation when its transition state changes, and a request for the
    // world already mounted changes nothing, so the loop below would spin to
    // its timeout with the playhead held. Nothing is pending here — give the
    // applied cast and camera two paints and release.
    if (outgoingEnvironment === expectedEnvironment) {
      await tick();
      await afterPaint();
      await afterPaint();
      return token === activeTransitionToken;
    }

    const startedAt = performance.now();

    while (token === activeTransitionToken) {
      const observation = latestEnvironmentTransition;
      if (
        observation?.settled &&
        observation.mountedKey === expectedEnvironment &&
        observation.requestedKey === expectedEnvironment
      ) {
        // A ready signal may land in the same update that activates the world.
        // Keep the outgoing frame opaque until the complete incoming
        // composition has survived two actual paints.
        await tick();
        await afterPaint();
        await afterPaint();
        return token === activeTransitionToken;
      }

      if (performance.now() - startedAt > 60_000) {
        console.error(
          `[FilmDirector] Incoming scene "${scene.id}" did not produce a settled frame within 60 seconds.`
        );
        return token === activeTransitionToken;
      }
      await afterPaint();
    }

    return false;
  }

  async function beginSceneTransition(
    scene: ResolvedDirectorScene
  ): Promise<void> {
    const token = ++activeTransitionToken;
    const transition = scene.transition;
    const previousScene = director.film.scenes.find(
      (candidate) => candidate.id === appliedSceneId
    );
    const timelineBlackIsOpaque =
      transition.kind === "fade-through-black" &&
      director.frame.fadeOpacity >= 0.98;
    const needsSnapshot = !timelineBlackIsOpaque;

    snapshotFading = false;
    snapshotOpacity = needsSnapshot && capturePresentedFrame() ? 1 : 0;
    snapshotVisible = snapshotOpacity === 1;
    snapshotDurationMs = Math.max(0, transition.durationSeconds * 1000);
    latestEnvironmentTransition = null;
    director.setTransitionHolding(true);

    if (snapshotVisible) {
      // Commit the complete outgoing frame to the screen before any scene,
      // cast, effect, or post-processing state changes. Expensive work then
      // happens behind pixels the browser has already presented instead of
      // lengthening the last live frame at the cut.
      await tick();
      await afterPaint();
      if (token !== activeTransitionToken) return;
    }

    const outgoingEnvironment = previousScene
      ? getSceneEnvironmentRendererKey(previousScene.location.environmentId)
      : null;
    transitionProfiler.beginHostTransition(
      outgoingEnvironment,
      getSceneEnvironmentRendererKey(scene.location.environmentId)
    );
    applyScene(scene);

    if (!(await waitForIncomingFrame(token, scene, outgoingEnvironment)))
      return;

    // The black overlay is already fully opaque at a fade-through-black scene
    // boundary. Releasing the held playhead lowers that same overlay over the
    // prepared incoming frame; no environment veil participates.
    if (timelineBlackIsOpaque) {
      director.setTransitionHolding(false);
      return;
    }

    director.setTransitionHolding(false);
    if (!snapshotVisible || snapshotDurationMs === 0) {
      snapshotVisible = false;
      snapshotOpacity = 0;
      return;
    }

    snapshotFading = true;
    await afterPaint();
    if (token !== activeTransitionToken) return;
    snapshotOpacity = 0;

    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, snapshotDurationMs + 80)
    );
    if (token !== activeTransitionToken) return;
    snapshotVisible = false;
    snapshotFading = false;
  }

  onMount(() => {
    transitionProfiler.start();
    director.setPosterSource(() => viewer.webglCanvas);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.height <= 0) return;
      viewportAspectRatio = entry.contentRect.width / entry.contentRect.height;
    });
    observer.observe(sceneElement);
    return () => {
      observer.disconnect();
      transitionProfiler.destroy();
      director.setPosterSource(null);
    };
  });

  $effect(() => {
    const preparationRevision = director.preparationRevision;
    if (preparationRevision !== observedPreparationRevision) {
      observedPreparationRevision = preparationRevision;
      warmupCursor = 0;
      acknowledgedWarmupCursor = -1;
      latestEnvironmentTransition = null;
      activeTransitionToken += 1;
      snapshotVisible = false;
      snapshotFading = false;
      snapshotOpacity = 0;
      director.setTransitionHolding(false);
      director.setPreparationScene(0);
    }

    const scene = presentedScene;
    if (scene.id === appliedSceneId) return;
    if (!director.preparation.complete || appliedSceneId === "") {
      applyScene(scene);
      return;
    }

    void beginSceneTransition(scene);
  });

  // Spelled and mirrored sequences have to be generated, so they arrive after
  // the opening scene is already on screen with the film's shared sequence.
  //
  // The re-application lives in the promise callback rather than in a second
  // effect on purpose. `applyScene` both reads and writes viewer state, so an
  // effect that calls it tracks everything it wrote and re-runs forever; the
  // microtask runs outside any tracking scope. A scene that has not been
  // applied yet needs nothing here — whenever it is applied it reads the
  // library, which by then holds the finished sequences.
  $effect(() => {
    const film = director.film;
    let active = true;
    // A film opened on one scene resolves that scene's sequences first, so the
    // scene the viewer is actually watching stops spinning the shared demo
    // without waiting behind twenty-three it is not showing.
    const warmed = director.warmupSceneIndex;
    void sequenceLibrary.prepare(film, {
      focusSceneId: warmed === null ? null : (film.scenes[warmed]?.id ?? null),
      // Per scene rather than once at the end: the scenes behind the focused
      // one land later, and whichever is on screen when its turn comes still
      // needs to pick them up.
      onSceneResolved: (sceneId) => {
        if (!active || sceneId !== appliedSceneId) return;
        const scene = film.scenes.find((candidate) => candidate.id === sceneId);
        // Full re-application, not a bare loadSequence sweep: loading a
        // sequence resets that performer's per-step plane overrides, so the
        // scene's plane direction has to go back on afterwards.
        if (scene) applyScene(scene);
      },
    });
    return () => {
      active = false;
    };
  });

  // A control-surface edit re-resolves the film in place, so the scene on
  // screen keeps its id and the cut effect above cannot see the change. The
  // revision counter is what moves; re-applying the same scene picks up its
  // new cast parameters without resetting the playhead or the warmup.
  $effect(() => {
    const revision = director.editRevision;
    if (revision === appliedEditRevision) return;
    appliedEditRevision = revision;

    const scene = director.film.scenes.find(
      (candidate) => candidate.id === appliedSceneId
    );
    if (scene) applyScene(scene);
  });

  /**
   * The control surface's write seam. Edits go to the film document, never to
   * the performer manager, because the manager is re-populated from that
   * document on every scene cut.
   */
  function handlePerformerEdit(edit: PerformerHubEdit): boolean {
    const scene = presentedScene;
    const cast = scene.performance.performers;
    // The dock lists every reserved performer slot, which can outnumber the
    // current scene's cast. Naming the missing slot rather than dropping the
    // edit lets the rejection say which performer this scene does not have.
    const indices = edit.performerIndices;
    const performerIds = indices
      ? indices.map((index) => cast[index]?.id ?? `performer-${index + 1}`)
      : edit.performerIndex === null
        ? cast.map((performer) => performer.id)
        : [
            cast[edit.performerIndex]?.id ??
              `performer-${edit.performerIndex + 1}`,
          ];

    return director.editPerformer({
      sceneId: scene.id,
      performerIds,
      field: edit.field,
      value: edit.value,
    });
  }

  /**
   * Every inspector edits the scene on screen, so a running film would move the
   * target out from under the user between opening a tool and choosing a value.
   * Opening one stops the film on the scene being edited.
   */
  function handleInspectorChange(tool: SceneControlTool | null): void {
    if (tool) director.pause();
  }

  /** The chair edits the scene on screen too, so it stops the film the same way. */
  function handleChairChange(open: boolean): void {
    if (open) director.pause();
  }

  $effect(() => {
    const camera = director.frame.camera;
    director.sceneReady;
    applyDirectorCameraFrame(viewer, camera, previewCameraFov);
  });

  $effect(() => {
    const motion = presentedMotion;
    director.sceneReady;
    applyDirectorPerformerMotion(viewer, motion);
  });

  $effect(() => {
    const steps = presentedEffectiveSteps;
    director.sceneReady;
    applyDirectorStepChanges(viewer, presentedScene, steps, appliedStepChanges);
  });

  onDestroy(() => {
    activeTransitionToken += 1;
    director.setTransitionHolding(false);
    viewer.dispose();
  });
</script>

<div
  bind:this={sceneElement}
  class="director-scene"
  data-director-scene={director.frame.scene.id}
  data-director-scene-ready={director.sceneReady}
  aria-hidden="true"
>
  <Viewer3DCanvas
    sequenceData={sequence}
    currentStep={director.preparation.complete
      ? director.frame.sequenceStep
      : 0}
    isPlaying={director.isPlaying}
    bpm={presentedScene.performance.bpm}
    hideOverlays={true}
    hidePerformerBadges={true}
    hideOrientationHelpers={true}
    fullScreen={true}
    enableEffects={true}
    enablePerformerLocomotion={true}
    {effectQualityTier}
    waitForPerformersOnInitialReveal={true}
    performerStepOffsets={presentedStepOffsets}
    performerSteps={presentedHeldSteps}
    visiblePerformerCount={presentedScene.performance.performers.length}
    stageBoundsPositions={presentedScene.performance.stageExtent}
    {retainedEnvironmentTypes}
    environmentTransitionVisualMode="host-controlled"
    sceneLoadTimeoutMs={60_000}
    onSceneReadyChange={handleSceneReadyChange}
    onEnvironmentTransitionChange={handleEnvironmentTransition}
  />
  <canvas
    bind:this={snapshotCanvas}
    class="scene-snapshot"
    class:visible={snapshotVisible}
    class:fading={snapshotFading}
    style:opacity={snapshotOpacity}
    style:--scene-dissolve-duration={`${snapshotDurationMs}ms`}
    aria-hidden="true"
  ></canvas>
  <div
    class="editorial-fade"
    style:opacity={director.frame.fadeOpacity}
    aria-hidden="true"
  ></div>
</div>

<!-- Outside .director-scene, which is aria-hidden: the control workspace is the
     one interactive thing over the stage and has to stay reachable. It renders
     here rather than in the workbench because it reads the viewer context this
     component establishes. The offset is the measured band the transport
     occupies. Save scene is off: the film panel owns saving here, and two save
     buttons that write different things is the confusion this replaced. -->
{#if director.preparation.complete}
  <SceneControlWorkspace
    bottomOffset="calc(var(--director-transport-reserve, 9.5rem) + 0.75rem)"
    leftOffset="calc(var(--director-exit-reserve, 8rem) + 0.75rem)"
    allowSaveScene={false}
    onPerformerEdit={handlePerformerEdit}
    onInspectorChange={handleInspectorChange}
    hostTool={{
      id: "director-chair",
      label: "Director's chair",
      icon: "fa-clapperboard",
    }}
    onHostPanelChange={handleChairChange}
  >
    {#snippet hostPanel(close: () => void)}
      <FilmDirectorCapabilityPanel onClose={close} />
    {/snippet}
  </SceneControlWorkspace>
{/if}

<style>
  .director-scene {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #070812;
  }

  .editorial-fade {
    position: absolute;
    inset: 0;
    z-index: 40;
    background: #020206;
    pointer-events: none;
  }

  .scene-snapshot {
    position: absolute;
    inset: 0;
    z-index: 39;
    width: 100%;
    height: 100%;
    visibility: hidden;
    pointer-events: none;
  }

  .scene-snapshot.visible {
    visibility: visible;
  }

  .scene-snapshot.fading {
    transition: opacity var(--scene-dissolve-duration) linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .editorial-fade,
    .scene-snapshot.fading {
      transition: none;
    }
  }
</style>
