<script lang="ts">
  import { useThrelte, useTask } from "@threlte/core";
  import { type Scene, type WebGLRenderer } from "three";
  import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { userProportionsState } from "@austencloud/scene-3d";
  import {
    detectOceanQuality,
    getOceanQualityConfig,
  } from "./quality/ocean-quality";
  import { oceanQualityOverride } from "./quality/ocean-quality-override.svelte";
  import { oceanDebugToggles } from "./quality/ocean-debug-toggles.svelte";
  import {
    causticUniforms,
  } from "./runtime/atmosphere/seabed-caustics";
  import { enhanceOceanSeabed } from "../../worlds/ocean/ocean-authored-flora";
  import { applyOceanSceneAppearance } from "../../worlds/ocean/ocean-scene-appearance";
  import FloraInstances from "./authored/FloraInstances.svelte";
  import OceanRuntimeSystems from "./runtime/OceanRuntimeSystems.svelte";
  import OceanDepthGradient from "./runtime/OceanDepthGradient.svelte";
  import { tryGetAdaptiveQualityContext } from "../../../context/adaptive-quality-context";
  import GlbEnvironment from "../../components/GlbEnvironment.svelte";
  import { requireRegisteredEnvironment } from "../../registry/environment-registry";
  import type { RegisteredEnvironmentProps } from "../../registry/environment-runtimes";

  // Lab previews mount Ocean without a registry lookup, so it defaults to its
  // own manifest (static/models/ocean/scene.json).
  type Props = Partial<RegisteredEnvironmentProps>;

  let {
    environment = requireRegisteredEnvironment("ocean"),
    performerCount = 1,
    stageWidth = 6,
    stageDepth = 6,
    stageZOffset = 0,
    worldYOffset = 0,
    active = true,
  }: Props = $props();


  const { scene, renderer } = useThrelte() as unknown as {
    scene: Scene;
    renderer: WebGLRenderer;
  };
  const adaptiveQuality = tryGetAdaptiveQualityContext();

  const qualityTier = $derived(
    oceanQualityOverride.tier !== "auto"
      ? oceanQualityOverride.tier
      : adaptiveQuality
        ? adaptiveQuality.contentTier === "high"
          ? "ultra"
          : adaptiveQuality.contentTier
        : detectOceanQuality(renderer)
  );
  const quality = $derived(getOceanQualityConfig(qualityTier));
  const floraRequired = $derived(quality.enableAuthoredFlora);




  // The seabed comes from the manifest's GLB, loaded by GlbEnvironment.
  let environmentGlb = $state<GLTF | null>(null);

  // The environment feature loads two GLBs: the seabed and the flora scene
  // (inside FloraInstances). GlbEnvironment folds the flora's real
  // loaded/total into the curtain beside the seabed's single step, weighted by
  // the manifest's glbProgressWeight, so the bar covers both and never bounces.
  // Ready fires only when both have landed.
  let floraFraction = $state(0);
  let floraLoaded = $state(false);

  $effect(() => {
    if (floraRequired) {
      floraFraction = 0;
      floraLoaded = false;
      return;
    }

    // LOW keeps the seabed, stage, lighting, and underwater colour, but skips
    // the 54M-vertex reef. The loading curtain should not wait for an asset this
    // tier deliberately does not request.
    floraFraction = 1;
    floraLoaded = true;
  });

  function handleFloraProgress(fraction: number) {
    floraFraction = fraction;
  }

  function handleFloraReady() {
    floraLoaded = true;
    floraFraction = 1;
  }

  const floraProgress = $derived({
    fraction: floraFraction,
    ready: !floraRequired || floraLoaded,
  });


  $effect(() => {
    if (!active) return;
    const appearance = applyOceanSceneAppearance({
      scene,
      renderer,
      enableFog: oceanDebugToggles.fog,
      enableImageBasedLighting:
        quality.enableImageBasedLighting && oceanDebugToggles.ibl,
    });
    return appearance.dispose;
  });

  // The floor receives the hero structures' shadows but does not spend a draw
  // casting underneath itself. Its neutral envMapIntensity lets the scene-level
  // underwater IBL control match the authored reef exactly.
  $effect(() => {
    const g = environmentGlb;
    if (!g) return;
    enhanceOceanSeabed(g.scene, {
      enableCaustics: quality.enableCaustics,
    });
  });

  // Single caustic clock for every patched material (seabed + flora). Keep the
  // mask anchored to the live seabed height, and let the dev `caustics` toggle
  // A/B the cue by zeroing strength (no shader recompile).
  useTask((delta) => {
    causticUniforms.uTime.value += delta;
  });
  $effect(() => {
    causticUniforms.uGroundY.value =
      userProportionsState.groundY + worldYOffset;
  });
  $effect(() => {
    // Live-tunable via the dev Caustics slider; the toggle still hard-zeroes it.
    causticUniforms.uCausticStrength.value =
      quality.enableCaustics && oceanDebugToggles.caustics
        ? oceanDebugToggles.causticStrength
        : 0;
  });

  // ── Device-pixel-ratio cap ─────────────────────────────────────────────
  // maxPixelRatio is defined per quality tier but was never applied to the live
  // renderer — only the offline exporter capped DPR. Retina phones (DPR 2.5-3)
  // therefore rendered the full caustic/boid/particle fragment load at native
  // resolution. Cap it here and restore the prior ratio on teardown so other
  // scenes are unaffected. Re-runs when the tier (and thus maxPixelRatio) changes.
  $effect(() => {
    if (!active || adaptiveQuality) return;
    const r = renderer;
    const prev = r.getPixelRatio();
    r.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    return () => {
      r.setPixelRatio(prev);
    };
  });
</script>

<GlbEnvironment
  {environment}
  {active}
  companion={floraProgress}
  bind:gltf={environmentGlb}
/>

{#if floraRequired}
  <FloraInstances
    {quality}
    {worldYOffset}
    onProgress={handleFloraProgress}
    onReady={handleFloraReady}
  />
{/if}

<!--
  Rendered first for reading order only. Draw order is owned by renderOrder=-1
  on the mesh itself, and depthTest:false means it always loses to real
  geometry — so it shows only through gaps, which is what silhouettes the
  shelf lip against the abyss.
-->
<OceanDepthGradient />

<OceanRuntimeSystems
  {quality}
  {performerCount}
  {stageWidth}
  {stageDepth}
  {stageZOffset}
  {worldYOffset}
/>
