import type { MethodPreviewTurns } from "$lib/features/create/shared/state/method-preview-turns.svelte";

/**
 * Runs `signal` inside an effect, as the front door's gate and the scenes do,
 * and counts how many times that effect runs. Stands in for a caller that
 * must not become a subscriber of the coordinator's turn state.
 */
export function observeTurnSignal(
  turns: MethodPreviewTurns,
  signal: (turns: MethodPreviewTurns) => void
) {
  let runs = 0;
  const dispose = $effect.root(() => {
    $effect(() => {
      runs += 1;
      signal(turns);
    });
  });

  return {
    get runs() {
      return runs;
    },
    dispose,
  };
}
