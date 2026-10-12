<script lang="ts">
  import type { SpatialLabState } from "../../state/spatial-lab-state.svelte";
  import { PRESETS } from "../../state/spatial-lab-constants";

  interface Props {
    state: SpatialLabState;
  }

  let { state }: Props = $props();
</script>

<div class="panel-section">
  <span class="panel-label">Presets</span>
  <div class="preset-grid">
    {#each PRESETS as preset}
      <button class="preset-btn" onclick={() => state.applyPreset(preset)}>
        {preset.name}
      </button>
    {/each}
  </div>
</div>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #666;
    font-weight: 600;
  }
  .preset-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .preset-btn {
    padding: 7px 8px;
    border: 1px solid #2a2a4a;
    background: #1a1a35;
    color: #aaa;
    font-size: 10px;
    cursor: pointer;
    border-radius: 5px;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast);
    text-align: center;
  }
  .preset-btn:hover {
    border-color: #4a4a6a;
    color: #ddd;
    background: #222250;
  }
</style>
