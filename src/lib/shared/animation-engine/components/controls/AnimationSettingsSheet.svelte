<!--
  AnimationSettingsSheet.svelte

  Settings drawer/sheet wrapper with header and close button.
  Contains the AnimationSettingsContent component.
-->
<script lang="ts">
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import AnimationSettingsContent from "./AnimationSettingsContent.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    isOpen = $bindable(false),
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
    isOpen: boolean;
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

<Drawer
  bind:isOpen
  placement="bottom"
  respectLayoutMode={true}
  closeOnBackdrop={true}
  closeOnEscape={true}
  ariaLabel={t("compose_animation_settings")}
  showHandle={true}
  class="settings-sheet-bottom"
>
  <div class="sheet-content">
    <!-- No header - swipe handle or tap backdrop to close -->
    <AnimationSettingsContent
      bind:bpm
      {leftMotionVisible}
      {rightMotionVisible}
      {currentPropType}
      {playbackMode}
      {stepPlaybackPauseMs}
      {stepPlaybackStepSize}
      {isPlaying}
      {onBpmChange}
      {onToggleLeft}
      {onToggleRight}
      {onPlaybackModeChange}
      {onStepPlaybackPauseMsChange}
      {onStepPlaybackStepSizeChange}
      {onPlaybackToggle}
    />
  </div>
</Drawer>

<style>
  /* Bottom Sheet Styles - ~55% height so animation remains visible.
     --sheet-max-height caps the bottom sheet; --sheet-radius-large rounds the
     top corners (Drawer bottom leaves the bottom corners square). */
  :global(.settings-sheet-bottom) {
    --sheet-max-height: 55dvh;
    --sheet-radius-large: 20px;
  }

  .sheet-content {
    display: flex;
    flex-direction: column;
    padding: 8px 16px 16px;
    height: 100%;
    background: var(--theme-panel-elevated-bg);
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
</style>
