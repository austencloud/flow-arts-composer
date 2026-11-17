import type { RenderablePerformer } from "../../state/performer-manager.svelte";

/**
 * The performers the worker renderer draws this frame.
 *
 * The worker stage adds and drops performers by id while it keeps drawing, so
 * a cast change never needs the other renderer. Swapping renderers for the
 * length of the arrive or leave motion cold-started both of them and left the
 * stage black with playback stopped.
 *
 * A leaving performer goes at once. It keeps its old place in the cast while
 * it leaves, and the survivor who moves into that place is found by the same
 * number: drawing both would give the leaver the survivor's badge, selection
 * ring and step. The worker has no arrive or leave motion yet, so there is
 * nothing to hold it on screen for.
 */
export function selectWorkerCast(
  renderable: readonly RenderablePerformer[],
  visibleCount: number
): RenderablePerformer[] {
  return renderable.filter(
    ({ castIndex, presencePhase }) =>
      presencePhase !== "exiting" && castIndex < visibleCount
  );
}
