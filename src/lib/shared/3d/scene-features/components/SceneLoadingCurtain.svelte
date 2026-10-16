<script lang="ts">
  /**
   * SceneLoadingCurtain
   *
   * Covers the 3D canvas with the viewer's loading screen until every
   * initially-enabled async scene feature has loaded, the cast is dressed
   * and the shaders run smoothly. Only shows on first load - toggling
   * features mid-session does NOT bring it back.
   *
   * The bar is the scene's loading session (scene-loading-session.svelte.ts): the
   * same one the viewer host showed while the 3D code downloaded, so it
   * carries on from there. This component tells it which milestones the
   * scene has reached; the bar's timing comes from the last completed load.
   */

  import { onMount } from "svelte";
  import { getSceneFeatureContext } from "../context/scene-feature-context";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { useSceneLoadingSession } from "../scene-loading-session.svelte.js";
  import ScenePreparationSurface, {
    SCENE_LOADING_LABELS,
  } from "./ScenePreparationSurface.svelte";

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
  const session = useSceneLoadingSession().open();

  // What the first reveal waits to download: the scene's assets, and the
  // cast when the host waits for it.
  const loadProgress = $derived(
    additionalRevealProgress === null
      ? sceneFeatures.initialRevealSettledProgress
      : (sceneFeatures.initialRevealSettledProgress +
          Math.max(0, Math.min(additionalRevealProgress, 1))) /
          2
  );
  const loaded = $derived(
    sceneFeatures.allInitialRevealFeaturesSettled && additionalRevealReady
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
  const labels = $derived(
    SCENE_LOADING_LABELS.includes(
      additionalRevealLabel as (typeof SCENE_LOADING_LABELS)[number]
    )
      ? SCENE_LOADING_LABELS
      : [...SCENE_LOADING_LABELS, additionalRevealLabel]
  );

  // Track whether the initial load has completed. Once it has,
  // the curtain never comes back - even if the user toggles on
  // a new async feature that hasn't loaded yet.
  let initialLoadComplete = $state(false);

  onMount(() => {
    session.reach("canvas");
  });

  // Milestones arrive in rank order: warmup ones wait for the load so a
  // compile that starts early never skips "loaded" in the stored timing.
  $effect(() => {
    if (initialLoadComplete) return;
    if (loadProgress >= 0.25) session.reach("load-25");
    if (loadProgress >= 0.5) session.reach("load-50");
    if (loadProgress >= 0.75) session.reach("load-75");
    if (!loaded) return;
    session.reach("loaded");
    // SceneShaderWarmup: compile covers 0-0.8, the smooth-frame gate the rest.
    if (sceneFeatures.warmupProgress >= 0.4) session.reach("warm-40");
    if (sceneFeatures.warmupProgress >= 0.8) session.reach("compiled");
  });

  $effect(() => {
    if (revealSettled && !initialLoadComplete) {
      session.complete();
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
      `[Curtain] load=${(loadProgress * 100).toFixed(0)}% warmup=${(sceneFeatures.warmupProgress * 100).toFixed(0)}% | enabled=[${enabled.map((f) => f.key)}] | pending=[${pending.map((f) => f.key)}]`
    );
  });
</script>

{#if showCurtain}
  <div class="curtain" out:opaqueFade={{ duration: DURATION.emphasis }}>
    <ScenePreparationSurface {statusText} {session} {labels} />
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
