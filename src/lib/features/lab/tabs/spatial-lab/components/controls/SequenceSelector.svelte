<script lang="ts">
  import type { SpatialLabState } from "../../state/spatial-lab-state.svelte";

  interface Props {
    state: SpatialLabState;
  }

  let { state: labState }: Props = $props();
</script>

<div class="panel-section">
  <span class="panel-label">Sequence Mode</span>
  {#if labState.mode === "sequence"}
    <button class="exit-btn" onclick={() => labState.exitSequenceMode()}>
      ← Back to Sandbox
    </button>
    <div class="active-seq">
      <span class="seq-name">{labState.activeSequence?.name}</span>
      <span class="seq-desc">{labState.activeSequence?.description}</span>
    </div>
  {:else}
    <div class="seq-list">
      {#each labState.demoSequences as seq}
        <button class="seq-btn" onclick={() => labState.loadSequence(seq)}>
          <span class="seq-btn-name">{seq.name}</span>
          <span class="seq-btn-desc">{seq.description}</span>
        </button>
      {/each}
    </div>
  {/if}
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
  .exit-btn {
    padding: 6px 10px;
    border: 1px solid #3a2a2a;
    background: #2a1a1a;
    color: #ff8844;
    font-size: 10px;
    cursor: pointer;
    border-radius: 5px;
    text-align: left;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast);
  }
  .exit-btn:hover {
    background: #3a2020;
    border-color: #ff8844;
  }
  .active-seq {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .seq-name {
    font-size: 12px;
    color: #fff;
    font-weight: 500;
  }
  .seq-desc {
    font-size: 10px;
    color: #888;
  }
  .seq-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .seq-btn {
    padding: 8px 10px;
    border: 1px solid #2a2a4a;
    background: #1a1a35;
    color: #aaa;
    cursor: pointer;
    border-radius: 5px;
    text-align: left;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .seq-btn:hover {
    border-color: #4a4a6a;
    color: #ddd;
    background: #222250;
  }
  .seq-btn-name {
    font-size: 11px;
    font-weight: 500;
    color: #ccc;
  }
  .seq-btn-desc {
    font-size: 9px;
    color: #666;
  }
</style>
