<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import TempoControl from "$lib/shared/animation-panel/components/TempoControl.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";

  interface Props {
    bpm: number;
    onBpmChange: (bpm: number) => void;
    isPlaying: boolean;
    onPlaybackToggle: () => void;
    onStepForward?: () => void;
    onStepBackward?: () => void;
    onHalfStepForward?: () => void;
    onHalfStepBackward?: () => void;
    showTransport?: boolean;
  }

  const {
    bpm,
    onBpmChange,
    isPlaying,
    onPlaybackToggle,
    onStepForward,
    onStepBackward,
    onHalfStepForward,
    onHalfStepBackward,
    showTransport = true,
  }: Props = $props();
</script>

<section class="playback-shell" aria-label={t("effect_deep_effect_playback")}>
  <div class="playback-row">
    <div class="tempo-cell">
      <TempoControl
        {bpm}
        {onBpmChange}
        showPresets={false}
        showPractice={false}
        presetsMode="popover"
      />
    </div>

    {#if showTransport}
      <div class="transport-cell">
        <TransportControls
          {isPlaying}
          {onPlaybackToggle}
          onStepHalfBeatForward={onHalfStepForward}
          onStepHalfBeatBackward={onHalfStepBackward}
          onStepFullBeatForward={onStepForward}
          onStepFullBeatBackward={onStepBackward}
        />
      </div>
    {/if}
  </div>
</section>

<style>
  .playback-shell {
    padding: 10px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .playback-row {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px 18px;
  }

  .tempo-cell {
    width: min(100%, 240px);
  }

  .transport-cell {
    flex: 0 0 auto;
  }

  .tempo-cell :global(.tempo-control) {
    justify-content: center;
  }

  .transport-cell :global(.transport-controls) {
    margin: 0;
  }
</style>
