<script lang="ts">
  import TransportControls from "#lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import TempoControl from "#lib/shared/animation-panel/components/TempoControl.svelte";
  import { getThirdOrderContext } from "../context/third-order-context";

  const state = getThirdOrderContext();
</script>

<footer class="transport" aria-label="Third Order playback">
  <div class="tempo-wrap">
    <TempoControl
      bpm={state.composition.bpm}
      onBpmChange={state.setBpm}
      showPresets={false}
      showPractice={false}
    />
  </div>
  <div class="timeline-wrap">
    <div class="count-readout">
      <span>{(state.masterBeat + 1).toFixed(2)}</span>
      <small>/ {Math.max(1, state.frame.totalBeats)} counts</small>
    </div>
    <input
      type="range"
      min="0"
      max={Math.max(0.01, state.frame.totalBeats - 0.01)}
      step="0.01"
      value={state.masterBeat}
      aria-label="Composition count"
      oninput={(event) =>
        state.setMasterBeat(Number(event.currentTarget.value))}
    />
  </div>
  <TransportControls
    isPlaying={state.isPlaying}
    onPlaybackToggle={state.togglePlayback}
    onStepHalfBeatBackward={() => state.stepBy(-0.5)}
    onStepHalfBeatForward={() => state.stepBy(0.5)}
    onRestartToStart={state.restart}
    onStepFullBeatForward={() => state.stepBy(1)}
  />
</footer>

<style>
  .transport {
    display: grid;
    grid-template-columns: minmax(170px, 0.65fr) minmax(240px, 1.5fr) minmax(
        220px,
        0.8fr
      );
    align-items: center;
    gap: 18px;
    min-height: 74px;
    padding: 10px clamp(14px, 2vw, 24px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-lg, 12px);
    background: var(--theme-panel-bg);
    box-shadow: var(--theme-shadow, 0 8px 24px rgba(0, 0, 0, 0.22));
  }
  .timeline-wrap {
    display: grid;
    grid-template-columns: auto minmax(120px, 1fr);
    align-items: center;
    gap: 13px;
  }
  .count-readout {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 112px;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }
  .count-readout span {
    font-size: 16px;
    font-weight: 800;
  }
  .count-readout small {
    color: var(--theme-text-dim, #9ca3af);
    font-size: var(--font-size-compact, 12px);
  }
  input[type="range"] {
    height: var(--min-touch-target, 44px);
    width: 100%;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 999px;
    background: var(--theme-stroke-strong);
  }
  input[type="range"]::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    margin-top: -7px;
    appearance: none;
    border: 2px solid var(--theme-panel-bg);
    border-radius: 50%;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px var(--theme-stroke-strong);
  }
  input[type="range"]::-moz-range-track {
    height: 4px;
    border-radius: 999px;
    background: var(--theme-stroke-strong);
  }
  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 2px solid var(--theme-panel-bg);
    border-radius: 50%;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px var(--theme-stroke-strong);
  }
  input[type="range"]:focus-visible {
    outline: 2px solid var(--theme-focus-ring, var(--theme-accent));
    outline-offset: 2px;
    border-radius: 4px;
  }
  @container (max-width: 880px) {
    .transport {
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      min-height: 66px;
      padding: 8px 10px;
    }
    .tempo-wrap {
      display: none;
    }
    .timeline-wrap {
      grid-column: 1 / 3;
    }
  }
  @container (max-width: 560px) {
    .transport {
      grid-template-columns: 1fr;
      gap: 4px;
      padding-block: 6px;
    }
    .timeline-wrap {
      grid-column: 1;
    }
    .count-readout {
      min-width: 96px;
    }
  }
</style>
