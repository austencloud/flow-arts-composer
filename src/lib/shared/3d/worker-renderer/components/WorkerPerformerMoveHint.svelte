<script lang="ts">
  import { onDestroy } from "svelte";
  import type { WorkerPerformerInteractionBridge } from "../services/worker-performer-interaction";

  interface Props {
    bridge: WorkerPerformerInteractionBridge;
    position: { x: number; z: number };
    groundY: number;
    placing: boolean;
    projectionRevision: number;
  }

  let { bridge, position, groundY, placing, projectionRevision }: Props =
    $props();
  let showHint = $state(bridge.takeMoveHint());
  const hintTimer = showHint
    ? setTimeout(() => (showHint = false), 2200)
    : null;
  onDestroy(() => {
    if (hintTimer) clearTimeout(hintTimer);
  });
  const projected = $derived.by(() => {
    void projectionRevision;
    return bridge.projectStagePosition(position, groundY + 0.08);
  });
</script>

{#if showHint && !placing && projected.visible}
  <span
    class="move-hint"
    style:left={`${projected.x}px`}
    style:top={`${projected.y}px`}>Drag to move</span
  >
{/if}

<style>
  .move-hint {
    position: absolute;
    z-index: 2;
    transform: translate(-50%, -50%);
    padding: 0.3rem 0.5rem;
    border-radius: 0.4rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
