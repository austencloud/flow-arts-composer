<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { WebGLRenderer } from "three";
  import { BackgroundType } from "@austencloud/backgrounds";
  import Environment3D from "#lib/shared/3d/environments/components/Environment3D.svelte";
  import EnvironmentReviewCamera from "#lib/shared/3d/environments/review/EnvironmentReviewCamera.svelte";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import HarnessToneMapping from "../winter-scene/HarnessToneMapping.svelte";
  import SceneProbe from "./SceneProbe.svelte";

  setSceneFeatureContext(
    createSceneFeatureState(
      { environment: true, stage: true },
      { isolated: true }
    )
  );
  let sample = $state("");
  let width = $state(1440);
  let height = $state(900);
  const views = {
    arrival: { position: [18, 8, 32], target: [0, 3, -1], fov: 52 },
    inside: { position: [0, 1.7, 11], target: [0, 3, -3], fov: 64 },
    lake: { position: [24, 7, -27], target: [0, 2.5, 0], fov: 55 },
    plan: { position: [0, 42, 20], target: [0, 0, 0], fov: 55 },
  } as const;
  let view = $state<keyof typeof views>("arrival");
  const preset = $derived(
    width / height < 0.8 && view === "arrival"
      ? {
          position: [26, 13, 48] as const,
          target: [0, 3, -1] as const,
          fov: 64,
        }
      : views[view]
  );
  const clean = $derived(page.url.searchParams.has("clean"));
  const reviewWorker = untrack(() => page.url.searchParams.has("worker"));
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />
<svelte:head><title>Spectrum Commons — Rainbow scene</title></svelte:head>
<main aria-label="Spectrum Commons scene review" data-scene={sample}>
  {#if page.url.searchParams.has("performers")}
    {#await import("./PerformerReview.svelte") then { default: PerformerReview }}
      <PerformerReview worker={reviewWorker} />
    {/await}
  {:else}
    <Canvas
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: true,
          preserveDrawingBuffer: true,
        })}
    >
      <HarnessToneMapping />
      <SceneProbe onSample={(value) => (sample = value)} />
      {#key preset}<EnvironmentReviewCamera
          destinationId="rainbow-scene-review"
          {preset}
        />{/key}
      <Environment3D
        backgroundType={BackgroundType.PRIDE}
        performerCount={1}
        stageWidth={6}
        stageDepth={6}
        stageZOffset={0}
      />
    </Canvas>
    {#if !clean}
      <nav aria-label="Review camera">
        {#each Object.keys(views) as key}
          <button
            type="button"
            aria-pressed={view === key}
            onclick={() => (view = key as keyof typeof views)}>{key}</button
          >
        {/each}
      </nav>
    {/if}
  {/if}
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    background: #07111f;
  }
  nav {
    position: absolute;
    bottom: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  button {
    min-height: 44px;
    padding: 8px 16px;
    border: 1px solid #ffffff70;
    border-radius: 8px;
    background: #07111fe8;
    color: #fff;
    text-transform: capitalize;
  }
  button[aria-pressed="true"] {
    background: #29445d;
  }
  button:focus-visible {
    outline: 3px solid #fbd38d;
    outline-offset: 3px;
  }
</style>
