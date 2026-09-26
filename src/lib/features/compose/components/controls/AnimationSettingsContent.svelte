<!--
  AnimationSettingsContent.svelte

  Content for the animation settings sheet/drawer.
  Consolidates playback configuration options:
  - Playback mode (continuous/step)
  - Motion visibility toggles
  - Speed (BPM) controls
  - Trail presets

  Note: Export settings (loop count) are in ExportActionsPanel
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import SimpleTrailControls from "$lib/shared/animation-engine/components/trail/SimpleTrailControls.svelte";
  import PlaybackModeToggle from "$lib/shared/animation-engine/components/controls/PlaybackModeToggle.svelte";
  import MotionColorChips from "$lib/shared/components/MotionColorChips.svelte";
  import StepModeSettings from "./StepModeSettings.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";

  let {
    bpm = $bindable(60),
    leftMotionVisible = true,
    rightMotionVisible = true,
    currentPropType = null,
    playbackMode = "continuous",
    stepPlaybackPauseMs = 300,
    stepPlaybackStepSize = 1,
    isPlaying = false,
    onBpmChange = () => {},
    onToggleLeft = () => {},
    onToggleRight = () => {},
    onPlaybackModeChange = () => {},
    onStepPlaybackPauseMsChange = () => {},
    onStepPlaybackStepSizeChange = () => {},
    onPlaybackToggle = () => {},
  }: {
    bpm: number;
    leftMotionVisible?: boolean;
    rightMotionVisible?: boolean;
    currentPropType?: PropType | string | null;
    playbackMode?: PlaybackMode;
    stepPlaybackPauseMs?: number;
    stepPlaybackStepSize?: StepPlaybackStepSize;
    isPlaying?: boolean;
    onBpmChange?: (bpm: number) => void;
    onToggleLeft?: () => void;
    onToggleRight?: () => void;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onStepPlaybackPauseMsChange?: (pauseMs: number) => void;
    onStepPlaybackStepSizeChange?: (stepSize: StepPlaybackStepSize) => void;
    onPlaybackToggle?: () => void;
  } = $props();
</script>

<div class="settings-content">
  <!-- Top row: Playback Mode + Visibility side by side -->
  <div class="top-row">
    <!-- Playback Mode -->
    <section class="settings-section compact">
      <h4 class="settings-section-title">{t("compose_ui_playback_mode")}</h4>
      <PlaybackModeToggle
        {playbackMode}
        {isPlaying}
        {onPlaybackModeChange}
        {onPlaybackToggle}
      />
    </section>

    <!-- Motion Visibility -->
    <section class="settings-section compact">
      <h4 class="settings-section-title">
        {t("compose_ui_motion_visibility")}
      </h4>
      <MotionColorChips
        showLeft={leftMotionVisible}
        showRight={rightMotionVisible}
        {onToggleLeft}
        {onToggleRight}
        leftLabel="Left"
        rightLabel="Right"
        layout="column"
        showVisibilityIcons
      />
    </section>
  </div>

  <!-- Step settings (only when step mode active) -->
  {#if playbackMode === "step"}
    <div class="step-row">
      <StepModeSettings
        {stepPlaybackStepSize}
        {stepPlaybackPauseMs}
        {isPlaying}
        {onStepPlaybackStepSizeChange}
        {onStepPlaybackPauseMsChange}
      />
    </div>
  {/if}

  <!-- Speed -->
  <section class="settings-section">
    <h4 class="settings-section-title">{t("compose_ui_speed")}</h4>
    <BpmChips bind:bpm min={15} max={180} step={1} {onBpmChange} />
  </section>

  <!-- Trails -->
  <section class="settings-section">
    <h4 class="settings-section-title">Trails</h4>
    <SimpleTrailControls propType={currentPropType} />
  </section>
</div>

<style>
  .settings-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Top row: 2-column grid for Playback Mode + Visibility */
  .top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* Step settings row */
  .step-row {
    margin-top: -4px;
  }

  /* Settings sections */
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Compact variant for top row sections */
  .settings-section.compact {
    gap: 4px;
  }

  .settings-section.compact .settings-section-title {
    font-size: var(--font-size-compact, 12px);
  }

  .settings-section-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
</style>
