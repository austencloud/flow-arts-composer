import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";

type SceneFeatureState = ReturnType<typeof createSceneFeatureState>;

/**
 * Mount an effect that reports for one feature, the way a scene's load effect
 * does, and count how often that effect runs.
 *
 * Reporters call the feature state from inside `$effect`. If a reporter reads
 * reactive state on its way to writing it, the caller's effect subscribes to
 * that state and reruns whenever ANY feature reports — which, for a scene that
 * restarts its asset load on every rerun, means cancelling the load over and
 * over while the rest of the scene boots.
 */
export function mountFeatureReporter(
  report: (state: SceneFeatureState) => void
): { state: SceneFeatureState; runs: () => number; dispose: () => void } {
  let runs = 0;
  let state!: SceneFeatureState;
  const stop = $effect.root(() => {
    state = createSceneFeatureState();
    $effect(() => {
      runs += 1;
      report(state);
    });
  });
  return { state, runs: () => runs, dispose: stop };
}
