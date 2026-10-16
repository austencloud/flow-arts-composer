/**
 * Reads an edit run's frame through a $derived, the way PictographContainer
 * does, so a test sees only the frames a component would be told about.
 */
import { flushSync } from "svelte";
import type { EditFrame } from "#lib/shared/pictograph/shared/services/pictograph-edit-travel.js";
import type { PictographEditMotion } from "#lib/shared/pictograph/shared/state/pictograph-edit-motion.svelte.js";

export function watchEditFrame(motion: PictographEditMotion, epoch: number) {
  const seen: (EditFrame | null)[] = [];
  const stop = $effect.root(() => {
    const frame = $derived(motion.frameFor(epoch));
    $effect(() => {
      seen.push(frame);
    });
  });
  flushSync();
  return {
    seen,
    flush: () => flushSync(),
    stop,
  };
}
