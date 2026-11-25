<!-- LoopFilm - "Watch it made": the steps, then each repeat flying out of the
     one before it, then the whole LOOP performed. Only plays when asked. -->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { madeLayout } from "../domain/loop-card-layout";
  import { loopFamily } from "../domain/loop-families";
  import type { MadeLoop } from "../services/loop-step-workshop";
  import { createLoopCardPlayer } from "../state/loop-card-player.svelte";
  import LoopCard from "./LoopCard.svelte";

  let { made }: { made: MadeLoop } = $props();

  const player = createLoopCardPlayer();
  onDestroy(player.dispose);

  const info = $derived(loopFamily(made.family));
  let width = $state(0);
  let height = $state(0);
  const layout = $derived(
    madeLayout({ width, height }, made.sequence.steps.length, made.partLength)
  );

  /** Plays the film from the start. */
  export function replay(): void {
    void player.make({
      partLength: made.partLength,
      steps: made.sequence.steps,
      changes: made.changes,
      backwards: made.family === "rewound",
      arriving: null,
    });
  }

  // Before the squares are drawn, so a row that is about to fly in never
  // shows itself early.
  $effect.pre(() => {
    void made;
    untrack(replay);
  });
</script>

<div
  class="film"
  role="presentation"
  style:--loop-color={info.color}
  style:--loop-ink={info.ink}
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  {#if width > 0 && height > 0}
    <LoopCard
      start={made.sequence.startPlacement ??
        made.sequence.startingPlacement ??
        null}
      steps={made.sequence.steps}
      {layout}
      {player}
      ink={info.ink}
    />
  {/if}
</div>

<style>
  .film {
    position: relative;
    height: 100%;
  }
</style>
