<script lang="ts">
  /** Live verification harness for the Moonlit Firefly Forest rebuild. */
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
  import ForestCompositionPlan from "./ForestCompositionPlan.svelte";
  import {
    createForestAtmosphereAnchor,
    isForestAtmosphereAnchorId,
  } from "#lib/shared/3d/environments/scenes/forest/forest-atmosphere-profile.js";

  const sceneFeatureState = createSceneFeatureState();
  setSceneFeatureContext(sceneFeatureState);
  const transitionVisual = createEnvironmentTransitionVisualState();
  transitionVisual.setRendererReady(true);
  setEnvironmentTransitionVisualContext(transitionVisual);

  const VIEW_PRESETS = {
    hero: {
      position: [0, 8, 31],
      target: [0, 2, 0],
      fov: 48,
    },
    reverse: {
      position: [0, 9, -31],
      target: [0, 2, 0],
      fov: 48,
    },
    walk: {
      position: [0, 2.2, 9],
      target: [0, 1.35, 0],
      fov: 58,
    },
    world: {
      position: [12, 58, 42],
      target: [14, 1, 1],
      fov: 55,
    },
    trees: {
      position: [2, 6.5, 20],
      target: [16, 5.5, 3],
      fov: 44,
    },
    floor: {
      position: [1, 3.1, 12],
      target: [9, 0.15, 2],
      fov: 46,
    },
    meadow: {
      position: [-10, 1.45, -3],
      target: [-7, 0.28, -12],
      fov: 54,
    },
    camp: {
      position: [29, 7.05, 23.5],
      target: [35, 1.25, 2.5],
      fov: 45,
    },
    campclose: {
      position: [31, 2.45, 13.5],
      target: [37.5, 0.97, 5.5],
      fov: 50,
    },
    arrival: {
      position: [7, 5.4, 20],
      target: [28, 1, 2],
      fov: 52,
    },
    tentdome: {
      position: [37.5, 1.9, 6.3],
      target: [41, 0.8, 1],
      fov: 50,
    },
    tenttunnel: {
      position: [34.5, 1.95, 11.5],
      target: [39, 0.8, 7.5],
      fov: 50,
    },
    tenttrekking: {
      position: [27.8, 1.95, 12],
      target: [32, 0.9, 8.5],
      fov: 50,
    },
    stage: {
      position: [-8, 4.5, 12],
      target: [0, 1.0, 0],
      fov: 46,
    },
    path: {
      position: [8, 4.4, 18],
      target: [-7, 1.0, -32],
      fov: 48,
    },
    paths: {
      position: [8, 4.4, 18],
      target: [-7, 1.0, -32],
      fov: 48,
    },
    pathwalk: {
      position: [-2.5, 2.2, -7],
      target: [-10, 1.1, -40],
      fov: 58,
    },
  } as const;

  const PHONE_HERO_PRESET = {
    position: [0, 9, 31],
    target: [0, 2, 0],
    fov: 98,
  } as const;

  type ViewName = keyof typeof VIEW_PRESETS;
  let viewportWidth = $state(1920);
  const requestedView = $derived(page.url.searchParams.get("view"));
  const requestedTime = $derived(page.url.searchParams.get("time"));
  const atmosphereId = $derived(
    isForestAtmosphereAnchorId(requestedTime) ? requestedTime : "night"
  );
  const atmosphere = $derived(createForestAtmosphereAnchor(atmosphereId));
  const showCompositionPlan = $derived(requestedView === "composition");
  const view = $derived(
    requestedView && requestedView in VIEW_PRESETS
      ? (requestedView as ViewName)
      : "hero"
  );
  /**
   * A free shot, for inspecting something the named presets do not frame --
   * a single tree, one prop, a seam between two clusters. `?cam=x,y,z` and
   * `?look=x,y,z` are runtime metres, so a layout position in Blender x/y
   * reaches this as `x,height,-y`. `?fov` is optional.
   */
  function parseVector(raw: string | null) {
    if (!raw) return null;
    const parts = raw.split(",").map((part) => Number(part.trim()));
    return parts.length === 3 && parts.every(Number.isFinite)
      ? ([parts[0], parts[1], parts[2]] as [number, number, number])
      : null;
  }

  const freeShot = $derived.by(() => {
    const position = parseVector(page.url.searchParams.get("cam"));
    const target = parseVector(page.url.searchParams.get("look"));
    if (!position || !target) return null;
    const fov = Number(page.url.searchParams.get("fov"));
    return { position, target, fov: Number.isFinite(fov) && fov > 0 ? fov : 46 };
  });

  const cameraPreset = $derived(
    freeShot ??
      (view === "hero" && viewportWidth <= 500
        ? PHONE_HERO_PRESET
        : VIEW_PRESETS[view])
  );
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<svelte:head>
  <title>{atmosphere.label} Forest verification</title>
</svelte:head>

{#if showCompositionPlan}
  <ForestCompositionPlan />
{:else}
  <div
    class="page"
    data-atmosphere={atmosphere.id}
    data-atmosphere-hour={atmosphere.hour}
  >
    <Canvas
      shadows
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        })}
    >
      <HarnessToneMapping />
      {#key `${view}:${page.url.search}`}
        <EnvironmentReviewCamera
          destinationId="forest-scene-review"
          preset={cameraPreset}
          walk={view === "walk" || view === "pathwalk"}
          maxOrbitDistance={240}
        />
      {/key}
      <Environment3D
        backgroundType={BackgroundType.FOREST}
        performerCount={1}
        stageWidth={6}
        stageDepth={6}
        stageZOffset={0}
        forestConfig={atmosphere.config}
      />
    </Canvas>
  </div>
{/if}

<style>
  :global(html),
  :global(body) {
    overflow: hidden;
  }

  :global(html) {
    scrollbar-gutter: auto;
  }

  .page {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: linear-gradient(#071020 0%, #102b32 58%, #172b1d 100%);
  }
</style>
