<script lang="ts">
  /**
   * SceneLoadingCurtain
   *
   * Dark overlay with drifting firefly dots and a progress bar.
   * Covers the 3D canvas until all initially-enabled async scene
   * features have reported their assets loaded. Only shows on first
   * load - toggling features mid-session does NOT bring it back.
   */

  import { getSceneFeatureContext } from "../context/scene-feature-context";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { fade } from "svelte/transition";
  import ScenePreparationSurface from "./ScenePreparationSurface.svelte";

  interface Props {
    additionalRevealReady?: boolean;
    additionalRevealProgress?: number | null;
    additionalRevealLabel?: string;
  }

  let {
    additionalRevealReady = true,
    additionalRevealProgress = null,
    additionalRevealLabel = "Finishing the scene",
  }: Props = $props();

  const sceneFeatures = getSceneFeatureContext();

  // Assets are only three quarters of a boot — shader compile and the
  // smoothness gate are the rest, and they used to run with the bar sitting
  // full. bootDisplayProgress covers both.
  const sceneProgress = $derived(sceneFeatures.bootDisplayProgress);
  const progress = $derived(
    additionalRevealProgress === null
      ? sceneProgress
      : (sceneProgress + Math.max(0, Math.min(additionalRevealProgress, 1))) / 2
  );
  // Downloaded is not the same as smooth. SceneShaderWarmup compiles the
  // scene's shaders and waits for frames to arrive on time behind this curtain;
  // lifting before it finishes is what put the stutter in plain view.
  const warmupComplete = $derived(sceneFeatures.warmupProgress >= 1);
  const revealSettled = $derived(
    sceneFeatures.allInitialRevealFeaturesSettled &&
      additionalRevealReady &&
      warmupComplete
  );
  const statusText = $derived(
    !sceneFeatures.allInitialRevealFeaturesSettled
      ? "Setting the stage"
      : !additionalRevealReady
        ? additionalRevealLabel
        : "Warming up"
  );

  // Track whether the initial load has completed. Once it has,
  // the curtain never comes back - even if the user toggles on
  // a new async feature that hasn't loaded yet.
  let initialLoadComplete = $state(false);

  $effect(() => {
    if (revealSettled && !initialLoadComplete) {
      initialLoadComplete = true;
    }
  });

  const showCurtain = $derived(!initialLoadComplete);

  $effect(() => {
    if (!showCurtain) return;
    const enabled = sceneFeatures.features.filter(
      (f) =>
        f.requiresAsyncLoad &&
        sceneFeatures.isEnabled(f.key) &&
        sceneFeatures.blocksInitialReveal(f.key)
    );
    const pending = enabled.filter(
      (feature) =>
        !sceneFeatures.isReady(feature.key) &&
        !sceneFeatures.getError(feature.key)
    );
    console.debug(
      `[Curtain] progress=${(progress * 100).toFixed(0)}% | enabled=[${enabled.map((f) => f.key)}] | pending=[${pending.map((f) => f.key)}]`
    );
  });

</script>

{#if showCurtain}
  <div
    class="curtain"
    out:fade={{ duration: motionDuration(DURATION.emphasis) }}
  >
    <ScenePreparationSurface {statusText} {progress} />
  </div>
{/if}

<style>
  .curtain {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
  }
</style>
