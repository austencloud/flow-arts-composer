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
   *
   * The reveal starts the moment the scene is ready: the bar finishes under
   * the status it already showed while the title and bar leave, the stage
   * dissolves into the scene within 300 ms, and `onRevealed` lets the host
   * bring its controls in once the scene is showing.
   */

  import { onDestroy, onMount } from "svelte";
  import { getSceneFeatureContext } from "../context/scene-feature-context";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import type { SceneEnvironmentId } from "../../environments/domain/scene-environment.js";
  import { useSceneLoadingSession } from "../scene-loading-session.svelte.js";
  import ScenePreparationSurface, {
    SCENE_LOADING_LABELS,
  } from "./ScenePreparationSurface.svelte";

  interface Props {
    /** The environment loading, so the curtain paints its sky. */
    environmentId?: SceneEnvironmentId;
    /** The sequence's name, shown above the horizon. */
    title?: string | null;
    additionalRevealReady?: boolean;
    additionalRevealProgress?: number | null;
    additionalRevealLabel?: string;
    /** The scene is showing: the host's controls can come in. */
    onRevealed?: () => void;
  }

  let {
    environmentId,
    title = null,
    additionalRevealReady = true,
    additionalRevealProgress = null,
    additionalRevealLabel = "Finishing the scene",
    onRevealed,
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
  // The status the bar finishes under. Whatever settled the load also moves
  // the status on, and a new word flashing in as the bar completes reads as
  // one more step, so the last word shown while loading stays.
  let loadingStatus = $state<string | null>(null);
  $effect.pre(() => {
    if (!revealSettled) loadingStatus = statusText;
  });
  const shownStatus = $derived(loadingStatus ?? statusText);
  const labels = $derived(
    SCENE_LOADING_LABELS.includes(
      additionalRevealLabel as (typeof SCENE_LOADING_LABELS)[number]
    )
      ? SCENE_LOADING_LABELS
      : [...SCENE_LOADING_LABELS, additionalRevealLabel]
  );

  // The whole reveal, from "ready" to the scene standing alone, is at most
  // REVEAL_TOTAL_MS. It used to hold the full bar on screen for 300 ms and
  // then push through for 950 ms more; measured 2026-11-14 that was 0.85 s of
  // a ready scene hidden on purpose. The bar's last stretch now fills while
  // the chrome fades.
  const REVEAL_TOTAL_MS = 300;

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

  // The reveal's beats. Reduced motion keeps the order but drops the push
  // and shortens the dissolve to a plain fade.
  const motion = reducedMotion()
    ? {
        hold: 0,
        chrome: DURATION.instant,
        delay: 0,
        stage: DURATION.normal,
        scale: 1,
        lift: 0,
      }
    : {
        hold: 0,
        chrome: DURATION.fast,
        delay: 0,
        stage: REVEAL_TOTAL_MS,
        scale: 1.04,
        lift: 4,
      };

  type RevealPhase = "loading" | "leaving" | "gone";
  let phase = $state<RevealPhase>("loading");
  const timers: ReturnType<typeof setTimeout>[] = [];
  const after = (ms: number, run: () => void) =>
    timers.push(setTimeout(run, ms));
  onDestroy(() => timers.forEach(clearTimeout));

  $effect(() => {
    if (!revealSettled || initialLoadComplete) return;
    initialLoadComplete = true;
    session.complete();
    phase = "leaving";
    // Halfway through the dissolve the scene is the larger part of the
    // picture, so the controls arrive onto it rather than onto the stage.
    after(motion.delay + motion.stage / 2, () => onRevealed?.());
    after(motion.delay + motion.stage, () => (phase = "gone"));
  });

  const showCurtain = $derived(phase !== "gone");

  $effect(() => {
    if (initialLoadComplete) return;
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
  <div
    class="curtain"
    data-reveal-phase={phase}
    style:--leave-chrome="{motion.chrome}ms"
    style:--leave-delay="{motion.delay}ms"
    style:--leave-stage="{motion.stage}ms"
    style:--leave-scale={motion.scale}
    style:--leave-lift="{motion.lift}px"
  >
    <ScenePreparationSurface
      statusText={shownStatus}
      {session}
      {labels}
      {environmentId}
      {title}
      leaving={phase === "leaving"}
    />
  </div>
{/if}

<style>
  .curtain {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
  }

  /* Let the scene take the pointer as soon as it starts to show. */
  .curtain[data-reveal-phase="leaving"] {
    pointer-events: none;
  }
</style>
