import { useScheduler, useStage } from "@threlte/core";
import { onDestroy } from "svelte";

const POSE_STAGE = Symbol("rendered-prop-pose");
const SOURCE_STAGE = Symbol("prop-effect-sources");
const PARTICLE_STAGE = Symbol("prop-effect-particles");

/** Shared per Canvas: live animation → captured pose → sources → particles. */
export function usePropEffectStages() {
  const { mainStage, renderStage } = useScheduler();
  const pose = useStage(POSE_STAGE, { after: mainStage, before: renderStage });
  const sources = useStage(SOURCE_STAGE, { after: pose, before: renderStage });
  const particles = useStage(PARTICLE_STAGE, {
    after: sources,
    before: renderStage,
  });
  return { pose, sources, particles };
}

/**
 * A per-frame task in the sources stage. Its callback may flushSync, and a
 * flush can unmount another performer's effects while this stage is still
 * walking its tasks. Threlte looks each task up again as it walks, so a task
 * removed mid-walk throws and every frame after it dies with a frozen canvas.
 * Stop the task at once and drop it once the frame is over.
 */
export function usePropEffectSourceTask(fn: (delta: number) => void) {
  const { autoInvalidations } = useScheduler();
  const { sources } = usePropEffectStages();
  const key = Symbol("prop-effect-source");
  const task = sources.createTask(key, fn);
  autoInvalidations.add(fn);
  onDestroy(() => {
    task.stop();
    autoInvalidations.delete(fn);
    queueMicrotask(() => sources.removeTask(key));
  });
}
