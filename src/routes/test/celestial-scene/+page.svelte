<script lang="ts">
  /** Live verification harness for the Celestial Sky Citadel. */
  import { Canvas } from "@threlte/core";
  import { page } from "$app/state";
  import { WebGLRenderer } from "three";
  import { BackgroundType } from "@austencloud/backgrounds";
  import Environment3D from "#lib/shared/3d/environments/components/Environment3D.svelte";
  import EnvironmentReviewCamera from "#lib/shared/3d/environments/review/EnvironmentReviewCamera.svelte";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import { createEnvironmentTransitionVisualState } from "#lib/shared/3d/environments/state/environment-transition-visual-state.svelte.js";
  import { setEnvironmentTransitionVisualContext } from "#lib/shared/3d/environments/context/environment-transition-visual-context.js";
  import HarnessToneMapping from "../winter-scene/HarnessToneMapping.svelte";
  import SceneAudioPlayer from "#lib/shared/3d/components/SceneAudioPlayer.svelte";
  import SceneShaderWarmup from "#lib/shared/3d/components/SceneShaderWarmup.svelte";
  import EnvironmentTransitionRenderPass from "#lib/shared/3d/environments/components/EnvironmentTransitionRenderPass.svelte";

  import SceneProbe from "../rainbow-scene/SceneProbe.svelte";
  let sceneSample = $state("");

  const sceneFeatureState = createSceneFeatureState();
  setSceneFeatureContext(sceneFeatureState);
  const transitionVisual = createEnvironmentTransitionVisualState();
  transitionVisual.setRendererReady(true);
  setEnvironmentTransitionVisualContext(transitionVisual);

  const VIEW_PRESETS = {
    hero: {
      position: [28, 19, 48],
      target: [0, 18, -38],
      fov: 54,
    },
    aisle: {
      position: [0, 1.65, 12],
      target: [0, 1.65, -20],
      fov: 70,
    },
    stage: {
      position: [13, 4.5, 18],
      target: [0, 0.5, -0.5],
      fov: 46,
    },
    profile: {
      position: [25, 7, 4],
      target: [0, 3, -3],
      fov: 48,
    },
    reverse: {
      position: [0, 8, -30],
      target: [0, 3, 0],
      fov: 50,
    },
    world: {
      position: [105, 90, 170],
      target: [0, 5, -30],
      fov: 60,
    },
  } as const;
  const PORTRAIT_PHONE_PRESET = {
    position: [0, 23, 65],
    target: [0, 22, -45],
    fov: 68,
  } as const;
  const LANDSCAPE_PHONE_PRESET = {
    position: [15, 20, 55],
    target: [0, 18, -35],
    fov: 52,
  } as const;

  type ViewName = keyof typeof VIEW_PRESETS;
  let viewportWidth = $state(1920);
  let viewportHeight = $state(1080);
  let selectedBackground = $state(BackgroundType.CELESTIAL);
  const requestedView = page.url.searchParams.get("view");
  const showTransitionControls = $derived(
    page.url.searchParams.has("controls")
  );
  let view = $state<ViewName>(
    requestedView && requestedView in VIEW_PRESETS
      ? (requestedView as ViewName)
      : "hero"
  );
  const cameraPreset = $derived(
    view === "hero" && viewportHeight <= 500
      ? LANDSCAPE_PHONE_PRESET
      : view === "hero" && viewportWidth / Math.max(1, viewportHeight) <= 0.8
        ? PORTRAIT_PHONE_PRESET
        : VIEW_PRESETS[view]
  );
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<svelte:head>
  <title>Celestial Sky Citadel — Celestial scene</title>
</svelte:head>

{#if page.url.searchParams.has("performers")}
  {#await import("./PerformerReview.svelte") then { default: PerformerReview }}
    <PerformerReview worker={page.url.searchParams.has("worker")} />
  {/await}
{:else}
  <div class="page" data-scene={sceneSample}>
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
      <SceneProbe
        worldName="celestial-environment-world"
        onSample={(value) => (sceneSample = value)}
      />
      <SceneShaderWarmup
        onReadyChange={(ready) => transitionVisual.setRendererReady(ready)}
      />
      <EnvironmentTransitionRenderPass />
      {#key cameraPreset}
        <EnvironmentReviewCamera
          destinationId="celestial-scene-review"
          preset={cameraPreset}
          maxOrbitDistance={350}
        />
      {/key}
      <Environment3D
        backgroundType={selectedBackground}
        performerCount={1}
        stageWidth={6}
        stageDepth={6}
        stageZOffset={0}
      />
    </Canvas>
    <SceneAudioPlayer backgroundType={selectedBackground} />
    {#if showTransitionControls}
      <div class="review-controls">
        <div class="control-group" role="group" aria-label="Camera review">
          <button
            type="button"
            class:active={view === "hero"}
            onclick={() => (view = "hero")}>Hero</button
          >
          <button
            type="button"
            class:active={view === "aisle"}
            onclick={() => (view = "aisle")}>Aisle</button
          >
          <button
            type="button"
            class:active={view === "stage"}
            onclick={() => (view = "stage")}>Stage</button
          >
          <button
            type="button"
            class:active={view === "profile"}
            onclick={() => (view = "profile")}>Profile</button
          >
        </div>
        <div
          class="control-group"
          role="group"
          aria-label="Environment transition review"
        >
          <button
            type="button"
            class:active={selectedBackground === BackgroundType.COSMIC}
            onclick={() => (selectedBackground = BackgroundType.COSMIC)}
            >Cosmic</button
          >
          <button
            type="button"
            class:active={selectedBackground === BackgroundType.CELESTIAL}
            onclick={() => (selectedBackground = BackgroundType.CELESTIAL)}
            >Citadel</button
          >
          <button
            type="button"
            class:active={selectedBackground === BackgroundType.OCEAN}
            onclick={() => (selectedBackground = BackgroundType.OCEAN)}
            >Ocean</button
          >
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .page {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: linear-gradient(#6f92c5 0%, #a7c6e8 58%, #f6d9b0 100%);
  }

  .review-controls {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
  }

  .control-group {
    display: flex;
    gap: 0.35rem;
    padding: 0.35rem;
    border: 1px solid rgb(255 255 255 / 0.34);
    border-radius: 999px;
    background: rgb(20 29 42 / 0.78);
  }

  .control-group button {
    min-height: 2.75rem;
    padding: 0.55rem 0.85rem;
    border: 0;
    border-radius: 999px;
    color: #eaf2fb;
    font:
      600 max(14px, 0.875rem) / 1 system-ui,
      sans-serif;
    background: transparent;
    cursor: pointer;
  }

  .control-group button.active {
    color: #172234;
    background: #eef5fb;
  }
</style>
