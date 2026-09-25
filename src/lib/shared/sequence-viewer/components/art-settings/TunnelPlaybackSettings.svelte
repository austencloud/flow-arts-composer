<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import TempoControl from "$lib/shared/animation-panel/components/TempoControl.svelte";
  import PlaybackModeToggle from "$lib/shared/animation-engine/components/controls/PlaybackModeToggle.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { reportArtSetting } from "./art-setting-change";
  import type {
    ArtSettingChangeHandler,
    ArtSettingValue,
  } from "./art-settings-types";

  interface Props {
    dense: boolean;
    bpm: number;
    playbackMode: PlaybackMode;
    isPlaying: boolean;
    onBpmChange: (bpm: number) => void;
    onPlaybackModeChange: (mode: PlaybackMode) => void;
    onPlaybackToggle: () => void;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let {
    dense,
    bpm,
    playbackMode,
    isPlaying,
    onBpmChange,
    onPlaybackModeChange,
    onPlaybackToggle,
    onArtSettingChange,
  }: Props = $props();

  function reportSetting(
    group: string,
    setting: string,
    previousValue: ArtSettingValue,
    value: ArtSettingValue,
    coalesce = false
  ): void {
    reportArtSetting(
      onArtSettingChange,
      group,
      setting,
      previousValue,
      value,
      coalesce
    );
  }
</script>

<div class="section-pad playback-rows">
  <div class="rt-section">
    <span class="rt-section-label">{t("viewer_ui_tempo")}</span>
    <TempoControl
      {bpm}
      {onBpmChange}
      showPresets={!dense}
      showPractice={false}
      presetsMode={dense ? "popover" : "inline"}
      vertical={!dense}
    />
  </div>
  <div class="rt-section">
    <span class="rt-section-label">{t("viewer_ui_mode")}</span>
    <PlaybackModeToggle
      {playbackMode}
      {isPlaying}
      {onPlaybackModeChange}
      {onPlaybackToggle}
      showDescriptions={!dense}
    />
  </div>
  <!-- Motion paths are playback behavior (they change how the props
           travel), so the tunnel gets them here too — same placement as the
           2D animation dock. The panel brings its own header row. -->
  <PathShapePanel
    onSettingChange={(previousValue, value) =>
      reportSetting("art_path", "shape", previousValue, value)}
  />
</div>

<style>
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }
  .rt-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rt-section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  /* Mobile dock tray: tighten the shared section bodies. Buttons/inputs keep
     their var(--min-touch-target) floor — only gaps and outer paddings collapse
     so the tray stays compact floating over the art. */
  :global(.dock-dense) .section-pad {
    gap: 8px;
    padding: 2px 2px 6px;
  }
  /* Playback: label-left rows + side-by-side mode buttons (mirrors
     AnimationPanel). Dock only — the sidebar keeps the vertical stack. */
  :global(.dock-dense) .playback-rows {
    gap: 6px;
    padding-bottom: 4px;
  }
  :global(.dock-dense) .playback-rows .rt-section {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  :global(.dock-dense) .playback-rows .rt-section-label {
    flex: 0 0 52px;
  }
  :global(.dock-dense) .playback-rows :global(.tempo-wrapper) {
    flex: 1;
    min-width: 0;
  }
  :global(.dock-dense) .playback-rows :global(.mode-toggle) {
    flex-direction: row;
    flex: 1;
    min-width: 0;
  }
  :global(.dock-dense) .playback-rows :global(.mode-toggle .mode-btn) {
    flex: 1;
    min-width: 0;
  }
</style>
