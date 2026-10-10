<script lang="ts">
  /**
   * Live verification harness for the Moody Twilight Reef ocean.
   *
   * Sibling of the winter-scene / forest-scene / autumn-scene harnesses. Exists
   * because Scene Lab (`/lab/themes`) is `adminOnly`, so it bounces to the
   * default module for any session without an admin account — including every
   * agent browser. The `ocean-probe` and `ocean-visual-ab` routes are the 2D
   * canvas background and share nothing with this scene.
   *
   * Presets are chosen to answer the Gate 2 lighting questions specifically:
   * `stage` frames the dais tightly enough to judge the key light's pool
   * against its falloff, and `shaft` looks up the hero god-ray column toward
   * the water plane.
   */
  import { Canvas } from "@threlte/core";
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import { WebGLRenderer } from "three";
  import { BackgroundType } from "@austencloud/backgrounds";
  import Environment3D from "#lib/shared/3d/environments/components/Environment3D.svelte";
  import EnvironmentReviewCamera from "#lib/shared/3d/environments/review/EnvironmentReviewCamera.svelte";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import { createEnvironmentTransitionVisualState } from "#lib/shared/3d/environments/state/environment-transition-visual-state.svelte.js";
  import { setEnvironmentTransitionVisualContext } from "#lib/shared/3d/environments/context/environment-transition-visual-context.js";
  import HarnessToneMapping from "./HarnessToneMapping.svelte";
  import HarnessInspector from "./HarnessInspector.svelte";
  import { clampPresetBelowWater } from "#lib/shared/3d/environments/scenes/ocean/ocean-camera-bounds.js";
  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createScene3DRenderState } from "#lib/shared/3d/scene-features/state/scene-3d-render-state.svelte.js";
  import { setScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import OceanExperienceControls from "./OceanExperienceControls.svelte";

  const viewer = createViewer3DState({
    renderMode: "3d",
    oceanVariant: "abyss",
  });
  setViewer3DContext(viewer);

  const effectsConfigState = createEffectsConfigState(undefined, {
    persist: false,
  });
  setEffectsConfigContext(effectsConfigState);
  const scene3DRenderState = createScene3DRenderState();
  setScene3DRenderContext(scene3DRenderState);

  const sceneFeatureState = createSceneFeatureState(
    {
      environment: true,
      stage: true,
      audience: false,
      campfire: false,
      tent: false,
    },
    { isolated: true }
  );
  setSceneFeatureContext(sceneFeatureState);
  const transitionVisual = createEnvironmentTransitionVisualState();
  transitionVisual.setRendererReady(true);
  setEnvironmentTransitionVisualContext(transitionVisual);

  const experienceSequence = demoSequenceJson as unknown as SequenceData;
  viewer.enter3D(experienceSequence);
  let currentStep = $state(0);
  let isPlaying = $state(true);
  let compactControls = $state(false);
  let experienceReady = $state(false);
  const bpm = 60;
  let playbackFrame = 0;
  // Dense casts stay readable through the performer rail and stage rings.
  const hideDensePerformerBadges = $derived(
    viewer.performerManager.performers.length > 4
  );

  onMount(() => {
    // The standalone experience enters in the Ocean, then uses the same global
    // scene setting as the production viewer so the Scene picker stays live.
    void settingsService.updateSetting("backgroundType", BackgroundType.OCEAN);
    experienceReady = true;

    const compactQuery = window.matchMedia(
      "(max-width: 48rem), (max-height: 34rem)"
    );
    const syncCompactControls = (): void => {
      compactControls = compactQuery.matches;
    };
    syncCompactControls();
    compactQuery.addEventListener("change", syncCompactControls);

    let previousTime = performance.now();

    const tick = (time: number): void => {
      const elapsedSeconds = Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      if (isPlaying) {
        const stepCount = Math.max(1, experienceSequence.steps.length);
        currentStep = (currentStep + elapsedSeconds * (bpm / 60)) % stepCount;
      }
      playbackFrame = requestAnimationFrame(tick);
    };

    playbackFrame = requestAnimationFrame(tick);

    return () => {
      compactQuery.removeEventListener("change", syncCompactControls);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(playbackFrame);
  });

  // The performer's shoulder is world y=0 and the seabed is groundY = -1.5, so
  // the stage deck top sits at y = +1.0 and the water plane at y = +22.12.
  const VIEW_PRESETS = {
    hero: {
      position: [0, 4.5, 19],
      target: [0, 1.6, -2],
      fov: 46,
    },
    stage: {
      position: [0, 4.2, 9],
      target: [0, 1, 0],
      fov: 44,
    },
    shaft: {
      position: [0, 1.8, 13],
      target: [0, 8.5, -1],
      fov: 62,
    },
    reef: {
      position: [-11, 3.6, 12],
      target: [4, 1.8, -6],
      fov: 48,
    },
    reverse: {
      position: [0, 5.5, -21],
      target: [0, 1.6, 0],
      fov: 48,
    },
    walk: {
      position: [0, 0.3, 8],
      target: [0, 0.4, 0],
      fov: 58,
    },
    world: {
      position: [0, 26, 30],
      target: [0, 0, 0],
      fov: 52,
    },
  } as const;

  type ViewName = keyof typeof VIEW_PRESETS;
  const reviewMode = $derived(
    page.url.searchParams.has("view") ||
      page.url.searchParams.has("cam") ||
      page.url.searchParams.get("review") === "1"
  );
  const requestedView = $derived(page.url.searchParams.get("view"));
  const view = $derived(
    requestedView && requestedView in VIEW_PRESETS
      ? (requestedView as ViewName)
      : "hero"
  );
  // The ocean has no sky and no surface break, so a camera above the water
  // plane looks up into space that was never authored. `?clamp=0` is the escape
  // hatch: the `world` preset sits at y=26 specifically to photograph the world
  // boundary from outside it, which the clamp would otherwise make impossible.
  const clampEnabled = $derived(page.url.searchParams.get("clamp") !== "0");

  // Free camera: ?cam=x,y,z&look=x,y,z&fov=n. The seven named presets answer
  // the lighting questions they were built for, but none of them frames an
  // arbitrary placement, and "is that arch the right size" cannot be settled
  // from a preset 30 m away. Reviewing a composed scene means being able to
  // walk up to any one object, so the harness takes a camera from the URL.
  // Falls back to the named preset when the params are absent or malformed.
  const triple = (raw: string | null) => {
    const parts = raw?.split(",").map(Number);
    return parts?.length === 3 && parts.every((n) => Number.isFinite(n))
      ? ([parts[0], parts[1], parts[2]] as [number, number, number])
      : null;
  };
  const freePreset = $derived.by(() => {
    const position = triple(page.url.searchParams.get("cam"));
    if (!position) return null;
    const target = triple(page.url.searchParams.get("look")) ?? [0, 1, 0];
    const fov = Number(page.url.searchParams.get("fov"));
    return {
      position,
      target,
      fov: Number.isFinite(fov) && fov > 0 ? fov : 46,
    };
  });

  const basePreset = $derived(freePreset ?? VIEW_PRESETS[view]);
  const cameraPreset = $derived(
    clampEnabled ? clampPresetBelowWater(basePreset) : basePreset
  );
  // Remount the camera whenever the framing changes, not just the named view.
  const cameraKey = $derived(JSON.stringify(cameraPreset));

  function seekToStep(targetStep: number): void {
    const stepCount = Math.max(1, experienceSequence.steps.length);
    currentStep = ((targetStep % stepCount) + stepCount) % stepCount;
  }

  function stepForward(): void {
    seekToStep(Math.floor(currentStep) + 1);
  }

  function stepBackward(): void {
    seekToStep(Math.ceil(currentStep) - 1);
  }
</script>

<svelte:head>
  <title>{reviewMode ? "Moody Twilight Reef verification" : "Ocean 3D"}</title>
</svelte:head>

<div class="page">
  {#if reviewMode}
    <Canvas
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        })}
    >
      <HarnessToneMapping />
      <HarnessInspector />
      {#key cameraKey}
        <EnvironmentReviewCamera
          destinationId="ocean-scene-review"
          preset={cameraPreset}
          walk={!freePreset && view === "walk"}
        />
      {/key}
      <Environment3D
        backgroundType={BackgroundType.OCEAN}
        performerCount={1}
        stageWidth={6}
        stageDepth={6}
        stageZOffset={0}
      />
    </Canvas>
  {:else if experienceReady}
    <Viewer3DCanvas
      sequenceData={experienceSequence}
      {currentStep}
      {isPlaying}
      {bpm}
      leftPropType="staff"
      rightPropType="staff"
      hideOverlays={compactControls}
      hidePerformerBadges={hideDensePerformerBadges}
      fullScreen={true}
      onPlaybackToggle={() => (isPlaying = !isPlaying)}
      onProgressBarSeek={seekToStep}
    />
    <OceanExperienceControls
      {isPlaying}
      {compactControls}
      {bpm}
      onPlaybackToggle={() => (isPlaying = !isPlaying)}
      onStepForward={stepForward}
      onStepBackward={stepBackward}
    />
  {:else}
    <div class="experience-loading" role="status">Preparing Ocean 3D…</div>
  {/if}
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0a2438;
  }

  .experience-loading {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.72);
    font-size: var(--font-size-min, 0.875rem);
  }
</style>
