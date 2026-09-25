<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import EffortPanel from "$lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte";
  import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import TunnelPlaybackSettings from "./TunnelPlaybackSettings.svelte";
  import { reportArtSetting } from "./art-setting-change";
  import type { ArtSettingChangeHandler } from "./art-settings-types";

  interface Props {
    dense?: boolean;
    includePlayback?: boolean;
    bpm: number;
    playbackMode: PlaybackMode;
    isPlaying: boolean;
    onBpmChange: (bpm: number) => void;
    onPlaybackModeChange: (mode: PlaybackMode) => void;
    onPlaybackToggle: () => void;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let {
    dense = false,
    includePlayback = true,
    bpm,
    playbackMode,
    isPlaying,
    onBpmChange,
    onPlaybackModeChange,
    onPlaybackToggle,
    onArtSettingChange,
  }: Props = $props();
</script>

<div class="motion-stack">
  <div class:dense class="section-pad">
    {#if includePlayback}<span class="rt-section-label"
        >{t("viewer_ui_effort")}</span
      >{/if}
    {#if !dense}
      <p class="section-hint">
        {t("viewer_ui_how_each_beat_speeds_up_and_slows_down")}
      </p>
    {/if}
    <EffortPanel
      columns={dense ? 4 : 2}
      showSubtitles={!dense}
      onSettingChange={(previousValue, value) =>
        reportArtSetting(
          onArtSettingChange,
          "art_effort",
          "preset",
          previousValue,
          value
        )}
    />
  </div>
  {#if includePlayback}
    <TunnelPlaybackSettings
      dense={false}
      {bpm}
      {playbackMode}
      {isPlaying}
      {onBpmChange}
      {onPlaybackModeChange}
      {onPlaybackToggle}
      {onArtSettingChange}
    />
  {/if}
</div>

<style>
  .motion-stack {
    display: grid;
    min-width: 0;
  }

  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }

  .section-pad.dense {
    gap: 8px;
    padding: 2px 2px 6px;
  }

  .section-hint {
    margin: 0;
    padding: 0 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    text-align: center;
  }

  .rt-section-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  @container animation-sidebar (min-width: 46rem) {
    .motion-stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }
</style>
