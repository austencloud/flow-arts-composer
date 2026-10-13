<script lang="ts">
  import type { SpatialLabState } from "../state/spatial-lab-state.svelte";

  interface Props {
    state: SpatialLabState;
  }

  let { state }: Props = $props();

  let statusColor = $derived.by(() => {
    if (!state.leftReachable || !state.rightReachable) return "red";
    if (state.crossing) return "yellow";
    return "green";
  });

  let statusText = $derived.by(() => {
    if (!state.leftReachable && !state.rightReachable)
      return "Both props out of reach";
    if (!state.leftReachable) return "Left prop out of reach";
    if (!state.rightReachable) return "Right prop out of reach";
    if (state.crossing) return "Arms crossing — body turn may help";
    return "Both props reachable";
  });
</script>

<div class="status-bar">
  <div class="status-item">
    <div class="status-dot {statusColor}"></div>
    <span>{statusText}</span>
  </div>
  <div class="flex-fill"></div>
  <span class="detail">
    L: {state.leftReachPct}% · R: {state.rightReachPct}%
    {#if state.bodyLocked}
      · LOCKED{/if}
  </span>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 20px;
    background: #12122a;
    border-top: 1px solid #2a2a4a;
    font-size: 11px;
    color: #888;
  }
  .status-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    transition: background var(--duration-emphasis);
  }
  .status-dot.green {
    background: #4aff8a;
  }
  .status-dot.yellow {
    background: #ffcc00;
  }
  .status-dot.red {
    background: #ff4a4a;
  }
  .flex-fill {
    flex: 1;
  }
  .detail {
    color: #555;
    font-size: 10px;
  }
</style>
