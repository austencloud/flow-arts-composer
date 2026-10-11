<!--
  SettingsTogglePanel.svelte

  Orchestrator for animation settings with mode switching.
  Toggle between Playback and Visual settings panes.
-->
<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import ModeTabBar, {
    type SettingsMode,
  } from "#lib/shared/animation-engine/components/ModeTabBar.svelte";
  import PlaybackPane from "#lib/shared/animation-engine/components/controls/settings-panel/PlaybackPane.svelte";
  import VisualPane from "#lib/shared/animation-engine/components/controls/settings-panel/VisualPane.svelte";

  let {
    propType = null,
    leftPropType = null,
    rightPropType = null,
    bpm = $bindable(60),
    playbackMode = "continuous",
    stepPlaybackStepSize = 1,
    isPlaying = false,
    onBpmChange = () => {},
    onPlaybackModeChange = () => {},
    onStepPlaybackStepSizeChange = () => {},
    onPlaybackToggle = () => {},
  }: {
    propType?: PropType | string | null;
    leftPropType?: PropType | string | null;
    rightPropType?: PropType | string | null;
    bpm: number;
    playbackMode?: PlaybackMode;
    stepPlaybackStepSize?: StepPlaybackStepSize;
    isPlaying?: boolean;
    onBpmChange?: (bpm: number) => void;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onStepPlaybackStepSizeChange?: (stepSize: StepPlaybackStepSize) => void;
    onPlaybackToggle?: () => void;
  } = $props();

  let activeMode = $state<SettingsMode>("playback");
</script>

<div class="settings-panel">
  <ModeTabBar {activeMode} onModeChange={(mode) => (activeMode = mode)} />

  <div class="settings-content">
    {#if activeMode === "playback"}
      <PlaybackPane
        bind:bpm
        {playbackMode}
        {stepPlaybackStepSize}
        {isPlaying}
        {onBpmChange}
        {onPlaybackModeChange}
        {onStepPlaybackStepSizeChange}
        {onPlaybackToggle}
      />
    {:else}
      <VisualPane {propType} {leftPropType} {rightPropType} />
    {/if}
  </div>
</div>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    padding: 8px;
    container-type: inline-size;
    container-name: settings-panel;
  }

  .settings-content {
    position: relative;
  }
</style>
