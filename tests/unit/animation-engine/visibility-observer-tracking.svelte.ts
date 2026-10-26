import { flushSync } from "svelte";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import type { AnimationPathPolicy } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

/**
 * Mirrors the mandala viewer opening inside Create: an effect hands the
 * manager a path policy while a viewer path session is open, and one of the
 * manager's observers keeps its own reactive counter (it reads, then writes).
 * Returns how many times the effect ran, or the error the flush threw.
 */
export function runPolicyEffectWithCountingObserver(
  policy: AnimationPathPolicy
): { effectRuns: number; error: unknown } {
  const manager = new AnimationVisibilityStateManager({ ephemeral: true });
  const closeSession = manager.beginPathSession(
    { pathShape: "arc", motionAwarePaths: false },
    0
  );

  let notifications = $state(0);
  const observer = () => {
    notifications = notifications + 1;
  };
  manager.registerObserver(observer);

  let effectRuns = 0;
  let error: unknown = null;
  const dispose = $effect.root(() => {
    $effect(() => {
      effectRuns += 1;
      manager.setPathPolicy(policy);
    });
  });

  try {
    flushSync();
  } catch (caught) {
    error = caught;
  } finally {
    dispose();
    manager.unregisterObserver(observer);
    closeSession();
  }

  return { effectRuns, error };
}
