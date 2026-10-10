/**
 * Runs playSceneTurns() inside an effect root, the way a scene component
 * calls it during init, with `playing` and `turn` as settable state.
 */
import { flushSync } from "svelte";
import type { SceneRun } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
import {
  playSceneTurns,
  type SceneTurnHooks,
} from "#lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.js";

export function sceneTurnsHarness(
  play: (run: SceneRun) => Promise<void>,
  hooks: SceneTurnHooks
) {
  let playing = $state(false);
  let turn = $state(0);
  const dispose = $effect.root(() => {
    playSceneTurns(() => ({ playing, turn }), play, hooks);
  });
  flushSync();
  return {
    set(next: { playing?: boolean; turn?: number }): void {
      if (next.playing !== undefined) playing = next.playing;
      if (next.turn !== undefined) turn = next.turn;
      flushSync();
    },
    dispose,
  };
}
