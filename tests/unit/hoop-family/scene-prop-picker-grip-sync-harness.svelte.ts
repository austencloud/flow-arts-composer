import { syncTriangleGripToScene } from "$lib/shared/3d/components/controls/scene-prop-picker-grip-sync.svelte";

/**
 * Mounts the real `syncTriangleGripToScene` production effect inside
 * `$effect.root`, the way `ScenePropPicker.svelte` mounts it with
 * `$effect(syncTriangleGripToScene)`. Runes only compile in `.svelte`/
 * `.svelte.ts` files, so a plain `.test.ts` cannot call `$effect.root`
 * itself and drives this harness instead.
 */
export function mountGripSync(): { dispose: () => void } {
  const stop = $effect.root(() => {
    $effect(syncTriangleGripToScene);
  });
  return { dispose: stop };
}
