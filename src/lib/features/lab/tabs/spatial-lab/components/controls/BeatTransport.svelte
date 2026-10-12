<script lang="ts">
  import type { SpatialLabState } from "../../state/spatial-lab-state.svelte";

  interface Props {
    state: SpatialLabState;
  }

  let { state: labState }: Props = $props();

  const bpmOptions = [30, 60, 90, 120];
</script>

{#if labState.mode === "sequence" && labState.activeSequence}
  <div class="panel-section">
    <span class="panel-label">Transport</span>
    <div class="transport-controls">
      <button
        class="transport-btn"
        aria-label="Previous step"
        disabled={labState.beatIndex === 0}
        onclick={() => labState.setBeat(labState.beatIndex - 1)}>⏮</button
      >
      <button
        class="transport-btn play"
        aria-label={labState.playing ? "Pause" : "Play"}
        aria-pressed={labState.playing}
        onclick={() => labState.togglePlayback()}
        >{labState.playing ? "⏸" : "▶"}</button
      >
      <button
        class="transport-btn"
        aria-label="Next step"
        disabled={labState.beatIndex >= labState.totalBeats - 1}
        onclick={() => labState.setBeat(labState.beatIndex + 1)}>⏭</button
      >
    </div>

    <div class="beat-scrubber">
      <span class="beat-label"
        >Step {labState.beatIndex + 1} / {labState.totalBeats}</span
      >
      <div class="beat-dots">
        {#each { length: labState.totalBeats } as _, i}
          <button
            class="beat-dot"
            class:active={i === labState.beatIndex}
            class:visited={i < labState.beatIndex}
            aria-label="Step {i + 1}"
            aria-pressed={i === labState.beatIndex}
            onclick={() => labState.setBeat(i)}
          ></button>
        {/each}
      </div>
    </div>

    {#if labState.currentBeat?.label}
      <div class="beat-info">{labState.currentBeat.label}</div>
    {/if}

    <div class="bpm-row">
      <span class="bpm-label">BPM</span>
      <div class="bpm-options">
        {#each bpmOptions as bpm}
          <button
            class="bpm-btn"
            class:active={labState.playbackBpm === bpm}
            aria-pressed={labState.playbackBpm === bpm}
            onclick={() => {
              labState.playbackBpm = bpm;
            }}>{bpm}</button
          >
        {/each}
      </div>
    </div>
  </div>
{/if}

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
  .transport-controls {
    display: flex;
    gap: 6px;
    justify-content: center;
  }
  .transport-btn {
    width: 36px;
    height: 36px;
    border: 1px solid #2a2a4a;
    background: #1a1a35;
    color: #aaa;
    font-size: 14px;
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast),
      width var(--duration-fast);
  }
  .transport-btn:hover:not(:disabled) {
    border-color: #4a4a6a;
    color: #fff;
    background: #222250;
  }
  .transport-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .transport-btn.play {
    width: 48px;
    border-color: #4a6aff;
    color: #4a6aff;
  }
  .transport-btn.play:hover {
    background: #2a2a5a;
  }

  .beat-scrubber {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .beat-label {
    font-size: 11px;
    color: #aaa;
    font-variant-numeric: tabular-nums;
  }
  .beat-dots {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .beat-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid #3a3a5a;
    background: #1a1a35;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast),
      width var(--duration-fast);
    padding: 0;
  }
  .beat-dot:hover {
    border-color: #6a6aff;
  }
  .beat-dot.active {
    background: #4a6aff;
    border-color: #6a8aff;
    box-shadow: 0 0 8px rgba(74, 106, 255, 0.4);
  }
  .beat-dot.visited {
    background: #2a2a5a;
    border-color: #4a4a6a;
  }

  .beat-info {
    text-align: center;
    font-size: 11px;
    color: #888;
    padding: 4px 8px;
    background: #1a1a30;
    border-radius: 4px;
    border: 1px solid #2a2a4a;
  }

  .bpm-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bpm-label {
    font-size: 10px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .bpm-options {
    display: flex;
    gap: 3px;
    flex: 1;
  }
  .bpm-btn {
    flex: 1;
    padding: 4px;
    border: 1px solid #2a2a4a;
    background: #1a1a35;
    color: #888;
    font-size: 10px;
    cursor: pointer;
    border-radius: 4px;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast),
      width var(--duration-fast);
  }
  .bpm-btn:hover {
    border-color: #4a4a6a;
    color: #ddd;
  }
  .bpm-btn.active {
    background: #2a2a5a;
    border-color: #4a6aff;
    color: #fff;
  }
</style>
