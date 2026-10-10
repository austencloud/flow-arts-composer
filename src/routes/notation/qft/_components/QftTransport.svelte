<script lang="ts">
  import HorizontalTransportRow from "#lib/shared/sequence-viewer/components/HorizontalTransportRow.svelte";
  import { getQftAppContext } from "../_context/qft-app-context";

  let { compact = false }: { compact?: boolean } = $props();
  const state = getQftAppContext();
</script>

<div class="transport" class:compact>
  <span class="counter">{state.step + 1} / 8</span>
  <HorizontalTransportRow
    isPlaying={state.playing}
    onPlaybackToggle={state.togglePlayback}
    onStepFullBack={() => state.stepBy(-1)}
    onStepFullFwd={() => state.stepBy(1)}
  />
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .counter {
    min-width: 5ch;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .compact {
    flex-direction: column;
    gap: 0.2rem;
  }

  .compact :global(.horizontal-transport-row) {
    padding: 0.35rem;
    background: transparent;
    border: none;
  }

  .compact :global(.play-btn) {
    width: 3rem;
    height: 3rem;
    min-width: 3rem;
    min-height: 3rem;
  }
</style>
