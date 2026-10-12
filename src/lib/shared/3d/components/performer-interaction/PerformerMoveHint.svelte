<script lang="ts">
  import { onDestroy } from "svelte";
  import { T } from "@threlte/core";
  import { HTML } from "@threlte/extras";

  interface Props {
    position: { x: number; z: number };
    groundY: number;
    placing: boolean;
    takeHint: () => boolean;
  }

  let { position, groundY, placing, takeHint }: Props = $props();
  let showHint = $state(takeHint());
  const hintTimer = showHint
    ? setTimeout(() => (showHint = false), 2200)
    : null;
  onDestroy(() => {
    if (hintTimer) clearTimeout(hintTimer);
  });
</script>

{#if showHint && !placing}
  <T.Group position={[position.x, groundY + 0.08, position.z]}>
    <HTML center sprite>
      <span class="move-hint">Drag to move</span>
    </HTML>
  </T.Group>
{/if}

<style>
  .move-hint {
    display: block;
    padding: 0.3rem 0.5rem;
    border-radius: 0.4rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
