<script lang="ts">
  import type { Snippet } from "svelte";

  // Stands in for InlineAnimationPlayer so layout tests skip the WebGL engine.
  // The scrubber row's trailing controls render in a positioned box, so they
  // take no room from the layout under test.
  let {
    scrubberTrailing,
    ..._props
  }: { scrubberTrailing?: Snippet } & Record<string, unknown> = $props();
</script>

<div class="player-stub">
  {#if scrubberTrailing}
    <div class="trailing-stub" data-progress-row>
      {@render scrubberTrailing()}
    </div>
  {/if}
</div>

<style>
  .player-stub {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .trailing-stub {
    position: absolute;
    right: 0;
    bottom: 0;
    display: flex;
  }
</style>
