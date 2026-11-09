<script lang="ts">
  /**
   * Review harness for scenes registered by a static/models/<scene>/scene.json.
   * `?scene=<id>` picks one (default: the trench floor, which no
   * BackgroundType names); the buttons list every registered scene, so a new
   * manifest shows up here with no edit to this page.
   */
  import { Canvas } from "@threlte/core";
  import { page } from "$app/state";
  import { WebGLRenderer } from "three";
  import Environment3D from "#lib/shared/3d/environments/components/Environment3D.svelte";
  import EnvironmentReviewCamera from "#lib/shared/3d/environments/review/EnvironmentReviewCamera.svelte";
  import { ENVIRONMENTS } from "#lib/shared/3d/environments/registry/environment-registry.js";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import HarnessToneMapping from "../winter-scene/HarnessToneMapping.svelte";

  const sceneFeatures = createSceneFeatureState(
    { environment: true, stage: false },
    { isolated: true }
  );
  setSceneFeatureContext(sceneFeatures);

  const ids = Object.keys(ENVIRONMENTS);
  const sceneId = $derived(
    page.url.searchParams.get("scene") ?? "water-traverse"
  );
  const environment = $derived(ENVIRONMENTS[sceneId] ?? null);
  const preset = {
    position: [9, 4, 14] as const,
    target: [0, 1, 0] as const,
    fov: 55,
  };
</script>

<svelte:head><title>Registered scenes</title></svelte:head>
<main
  aria-label="Registered scene review"
  data-scene={sceneId}
  data-ready={sceneFeatures.isReady("environment")}
>
  {#if environment}
    <Canvas
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: true,
          preserveDrawingBuffer: true,
        })}
    >
      <HarnessToneMapping />
      <EnvironmentReviewCamera
        destinationId="glb-environment-review"
        {preset}
      />
      <Environment3D backgroundType={sceneId} performerCount={1} />
    </Canvas>
  {:else}
    <p>No scene.json registers “{sceneId}”.</p>
  {/if}
  <nav aria-label="Registered scenes">
    {#each ids as id (id)}
      <a
        href={`?scene=${id}`}
        aria-current={id === sceneId ? "page" : undefined}
        >{ENVIRONMENTS[id]!.label}</a
      >
    {/each}
  </nav>
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    background: #07111f;
    color: #fff;
  }
  p {
    margin: 0;
    padding: 24px 16px;
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
  a {
    min-height: 36px;
    padding: 8px 16px;
    border: 1px solid #ffffff70;
    border-radius: 8px;
    background: #07111fe8;
    color: #fff;
    text-decoration: none;
  }
  a[aria-current="page"] {
    background: #29445d;
  }
  a:focus-visible {
    outline: 3px solid #fbd38d;
    outline-offset: 3px;
  }
</style>
