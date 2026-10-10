<!--
  AnimationControlsPanel - Orchestrates playback, BPM, visibility, and export controls.

  Uses futuristic inline SettingsTogglePanel for mode switching between
  Playback (style, BPM) and Visual (motion, elements, trails) settings.

  Responsive modes:
  - Mobile compact: CompactMobileRow + tool area (beat grid or BPM presets)
  - Mobile expanded: All controls visible, scrollable
  - Desktop: Fixed layout with full controls
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { settingsService as settingsServiceSingleton } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
  import {
    animationSettings,
    TrailMode,
  } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import type { SettingsState } from "#lib/shared/settings/state/settings-state.svelte.js";

  // Subcomponents
  import QuickBpmPresets from "#lib/shared/animation-engine/components/QuickBpmPresets.svelte";
  import TransportControls from "#lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import SettingsTogglePanel from "#lib/shared/animation-engine/components/controls/SettingsTogglePanel.svelte";
  import ExportActionsPanel from "#lib/shared/animation-engine/components/ExportActionsPanel.svelte";
  import AnimationStepGrid from "#lib/shared/animation-engine/components/AnimationStepGrid.svelte";

  type MobileToolView = "controls" | "step-grid";

  const debug = createComponentLogger("AnimationControlsPanel");
  const DEFAULT_BPM = 60;
  const COMPACT_CONTROLS_HEIGHT = 800;
  const COMPACT_CONTROLS_WIDTH = 380;

  let {
    speed = 1,
    isPlaying = false,
    leftMotionVisible = true,
    rightMotionVisible = true,
    playbackMode = "continuous",
    stepPlaybackPauseMs = 300,
    stepPlaybackStepSize = 1,
    isSideBySideLayout = false,
    isExpanded = false,
    scrollContainerRef = $bindable(null),
    isSettingsOpen = $bindable(false),
    isExporting = false,
    exportProgress = null,
    mobileToolView = "controls" as MobileToolView,
    sequenceData = null,
    currentStep = 0,
    onSpeedChange = () => {},
    onPlaybackStart = () => {},
    onPlaybackToggle = () => {},
    onPlaybackModeChange = () => {},
    onStepPlaybackPauseMsChange = () => {},
    onStepPlaybackStepSizeChange = () => {},
    onStepHalfBeatBackward = () => {},
    onStepHalfBeatForward = () => {},
    onStepFullBeatBackward = () => {},
    onStepFullBeatForward = () => {},
    onToggleLeft = () => {},
    onToggleRight = () => {},
    onToggleExpanded = () => {},
    onToggleToolView = () => {},
    onExportVideo = () => {},
    onCancelExport = () => {},
    isCircular = false,
    loopCount = 1,
    onLoopCountChange = () => {},
    preventBackNavAction = () => {},
    onScroll = () => {},
  }: {
    speed?: number;
    isPlaying?: boolean;
    leftMotionVisible?: boolean;
    rightMotionVisible?: boolean;
    playbackMode?: import("#lib/shared/animation-engine/state/animation-panel-state.svelte.js").PlaybackMode;
    stepPlaybackPauseMs?: number;
    stepPlaybackStepSize?: import("#lib/shared/animation-engine/state/animation-panel-state.svelte.js").StepPlaybackStepSize;
    isSideBySideLayout?: boolean;
    isExpanded?: boolean;
    scrollContainerRef?: HTMLDivElement | null;
    isSettingsOpen?: boolean;
    isExporting?: boolean;
    exportProgress?: { progress: number; stage: string } | null;
    mobileToolView?: MobileToolView;
    sequenceData?: SequenceData | null;
    currentStep?: number;
    onSpeedChange?: (newSpeed: number) => void;
    onPlaybackStart?: () => void;
    onPlaybackToggle?: () => void;
    onPlaybackModeChange?: (
      mode: import("#lib/shared/animation-engine/state/animation-panel-state.svelte.js").PlaybackMode
    ) => void;
    onStepPlaybackPauseMsChange?: (pauseMs: number) => void;
    onStepPlaybackStepSizeChange?: (
      stepSize: import("#lib/shared/animation-engine/state/animation-panel-state.svelte.js").StepPlaybackStepSize
    ) => void;
    onStepHalfBeatBackward?: () => void;
    onStepHalfBeatForward?: () => void;
    onStepFullBeatBackward?: () => void;
    onStepFullBeatForward?: () => void;
    onToggleLeft?: () => void;
    onToggleRight?: () => void;
    onToggleExpanded?: () => void;
    onToggleToolView?: () => void;
    onExportVideo?: () => void;
    onCancelExport?: () => void;
    isCircular?: boolean;
    loopCount?: number;
    onLoopCountChange?: (count: number) => void;
    preventBackNavAction?: (
      node: HTMLElement,
      isSideBySideLayout: boolean
    ) => any;
    onScroll?: (e: Event) => void;
  } = $props();

  // BPM state - initialized with default, $effect syncs from prop
  let bpm = $state(DEFAULT_BPM);
  $effect(() => {
    bpm = Math.round(speed * DEFAULT_BPM);
  });

  function handleBpmChange(newBpm: number) {
    const newSpeed = newBpm / DEFAULT_BPM;
    onSpeedChange(newSpeed);
  }

  // Settings service for prop types
  let settingsService: SettingsState | null = $state(null);

  // Viewport detection
  let viewportHeight = $state(0);
  let viewportWidth = $state(0);

  onMount(() => {
    if (!browser) return;

    settingsService = settingsServiceSingleton;

    const checkViewport = () => {
      viewportHeight = window.innerHeight;
      viewportWidth = window.innerWidth;
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  });

  const useCompactControls = $derived(
    (viewportHeight > 0 && viewportHeight < COMPACT_CONTROLS_HEIGHT) ||
      (viewportWidth > 0 && viewportWidth < COMPACT_CONTROLS_WIDTH)
  );

  // Settings sheet state - sync with bindable prop
  let isSettingsSheetOpen = $state(false);

  // Sync internal state with bindable prop for parent to track
  $effect(() => {
    isSettingsOpen = isSettingsSheetOpen;
  });

  // Derive trail preset for settings button summary
  const currentTrailPreset = $derived.by(() => {
    const trail = animationSettings.trail;
    if (trail.mode === TrailMode.OFF) return "Off";
    return "On";
  });

  // Derive playback mode label for settings summary
  const playbackModeLabel = $derived(
    playbackMode === "step" ? "Step" : "Continuous"
  );

  // Get prop types from SETTINGS (not sequence data)
  const leftPropType = $derived.by(() => {
    if (!settingsService) return null;
    return (
      settingsService.settings.leftPropType ??
      settingsService.settings.propType ??
      null
    );
  });

  const rightPropType = $derived.by(() => {
    if (!settingsService) return null;
    return (
      settingsService.settings.rightPropType ??
      settingsService.settings.propType ??
      null
    );
  });

  const currentPropType = $derived.by(() => {
    return leftPropType ?? rightPropType ?? null;
  });
</script>

<div
  class="controls-panel"
  class:mobile-compact={!isExpanded && !isSideBySideLayout}
  class:mobile-expanded={isExpanded && !isSideBySideLayout}
  class:desktop={isSideBySideLayout}
  bind:this={scrollContainerRef}
  use:preventBackNavAction={isSideBySideLayout}
  onscroll={onScroll}
>
  <!-- Mobile Compact Mode -->
  {#if !isSideBySideLayout && !isExpanded}
    {#await import("#lib/features/compose/components/controls/CompactMobileRow.svelte") then mod}
      <mod.default
        {mobileToolView}
        {isPlaying}
        {isExpanded}
        {onToggleToolView}
        {onPlaybackToggle}
        {onToggleExpanded}
      />
    {/await}

    <!-- Tool Area: Beat Grid or Quick Presets -->
    {#if mobileToolView === "step-grid"}
      <div class="beat-grid-area">
        <AnimationStepGrid {sequenceData} {currentStep} {isPlaying} />
      </div>
    {:else}
      <div class="control-row quick-presets-row">
        <QuickBpmPresets {bpm} onBpmChange={handleBpmChange} />
      </div>
    {/if}
  {/if}

  <!-- Expanded/Desktop Mode: Playback Row (just transport controls) -->
  {#if isSideBySideLayout || isExpanded}
    <div class="control-row playback-row">
      <TransportControls
        {isPlaying}
        {onPlaybackToggle}
        {onStepHalfBeatBackward}
        {onStepHalfBeatForward}
        {onStepFullBeatBackward}
        {onStepFullBeatForward}
      />
    </div>

    <!-- Futuristic Settings Toggle Panel - switches between Playback and Visual modes -->
    {#if !useCompactControls}
      <SettingsTogglePanel
        propType={currentPropType}
        {leftPropType}
        {rightPropType}
        bind:bpm
        {playbackMode}
        {stepPlaybackStepSize}
        {isPlaying}
        onBpmChange={handleBpmChange}
        {onPlaybackModeChange}
        {onStepPlaybackStepSizeChange}
        {onPlaybackToggle}
      />
    {:else}
      <!-- Compact: Single settings button for all settings -->
      <div class="control-row compact-row-settings">
        <button
          class="settings-sheet-btn"
          onclick={() => (isSettingsSheetOpen = true)}
          type="button"
          aria-label={t("playback_audit_open_settings")}
        >
          <i class="fas fa-sliders-h" aria-hidden="true"></i>
          <span class="settings-btn-label">{t("playback_audit_settings")}</span>
          <span class="settings-summary">{playbackModeLabel} · {bpm} BPM</span>
        </button>
      </div>
    {/if}
  {/if}

  <!-- Export -->
  {#if isSideBySideLayout || isExpanded}
    <ExportActionsPanel
      {onExportVideo}
      {onCancelExport}
      {isExporting}
      {exportProgress}
      {isCircular}
      {loopCount}
      {onLoopCountChange}
    />
  {/if}
</div>

<!-- Settings Sheet (Compact mobile - all settings) -->
{#await import("#lib/features/compose/components/controls/AnimationSettingsSheet.svelte") then mod}
  <mod.default
    bind:isOpen={isSettingsSheetOpen}
    bind:bpm
    {leftMotionVisible}
    {rightMotionVisible}
    {currentPropType}
    {playbackMode}
    {stepPlaybackPauseMs}
    {stepPlaybackStepSize}
    {isPlaying}
    onBpmChange={handleBpmChange}
    {onToggleLeft}
    {onToggleRight}
    {onPlaybackModeChange}
    {onStepPlaybackPauseMsChange}
    {onStepPlaybackStepSizeChange}
    {onPlaybackToggle}
  />
{/await}

<style>
  /* Controls Panel Container */
  .controls-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 0 0 auto;
    gap: 8px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke);
    border-radius: 14px;
    -webkit-overflow-scrolling: touch;
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .controls-panel.mobile-compact {
    overflow-y: hidden !important;
    overflow-x: hidden;
    flex: 0 0 auto;
    max-height: none;
    padding: 8px;
    gap: 0;
  }

  .controls-panel.mobile-expanded {
    overflow-y: auto !important;
    overflow-x: hidden;
    overscroll-behavior: contain;
    flex: 1 1 0;
    min-height: 0;
    max-height: none;
    padding: 10px;
    gap: 8px;
  }

  .controls-panel.desktop {
    overflow-y: hidden !important;
    overflow-x: hidden;
    flex: 0 0 auto;
    padding: 10px;
    gap: 10px;
  }

  /* Scrollbar */
  .controls-panel::-webkit-scrollbar {
    width: 6px;
  }
  .controls-panel::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 3px;
  }
  .controls-panel::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }
  .controls-panel::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Control Rows */
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .quick-presets-row {
    justify-content: center;
  }

  .playback-row {
    justify-content: center;
    gap: 8px;
  }

  /* Compact Settings Button */
  .compact-row-settings {
    width: 100%;
  }

  .settings-sheet-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--min-touch-target);
    padding: 10px 14px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .settings-sheet-btn i {
    font-size: 1rem;
    color: var(--theme-accent, rgba(139, 92, 246, 0.8));
  }

  .settings-sheet-btn .settings-btn-label {
    flex: 0 0 auto;
  }

  .settings-sheet-btn .settings-summary {
    flex: 1;
    text-align: right;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .settings-sheet-btn:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
    }
  }

  .settings-sheet-btn:active {
    transform: scale(0.98);
  }

  /* Responsive */
  @media (max-width: 480px) {
    .controls-panel {
      padding: 8px;
      gap: 8px;
    }
    .control-row {
      gap: 6px;
    }
  }

  @media (max-height: 500px) and (orientation: landscape) {
    .controls-panel {
      padding: 8px;
      gap: 6px;
    }
  }
</style>
