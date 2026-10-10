<!--
  PracticeBentoLayout.svelte - Unified bento box layout for Practice tab

  Everything is in the layout flow - no floating elements!

  Mobile (stacked):
  ┌─────────────────┐
  │   Camera Feed   │
  ├─────────────────┤
  │   Beat Grid     │
  ├─────────────────┤
  │  Control Bar    │
  └─────────────────┘

  Desktop (side-by-side):
  ┌──────────┬──────────┐
  │          │ Sequence │
  │  Camera  ├──────────┤
  │   Feed   │Beat Grid │
  │          ├──────────┤
  │          │ Controls │
  └──────────┴──────────┘
-->
<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { TrainMode, PracticeMode } from "../../domain/enums/train-enums";
  import CameraSection from "./CameraSection.svelte";
  import GridSection from "./GridSection.svelte";
  import ControlBar from "./ControlBar.svelte";
  import GridSettingsInline from "./GridSettingsInline.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    sequence: SequenceData | null;
    currentStepIndex?: number;
    isPlaying?: boolean;
    bpm?: number;
    // Camera props
    isCameraReady?: boolean;
    isDetectionReady?: boolean;
    isDetectionActive?: boolean;
    isPerforming?: boolean;
    currentFrame?: DetectionFrame | null;
    expectedPositions?: {
      left: GridLocation | null;
      right: GridLocation | null;
    } | null;
    mode?: TrainMode;
    practiceMode?: PracticeMode;
    countdownValue?: number | null;
    currentScore?: number;
    currentCombo?: number;
    lastHitResult?: boolean | null;
    lastHitPoints?: number;
    gridScale?: number;
    gridMode?: GridMode;
    propsVisible?: boolean;
    canStartPerformance?: boolean;
    // Callbacks
    onCameraReady?: () => void;
    onCameraError?: (error: string) => void;
    onFrame?: (video: HTMLVideoElement) => void;
    onStepSelect?: (stepIndex: number) => void;
    onBrowseSequences?: () => void;
    onPlayStop?: () => void;
    onModeClick?: () => void;
    onSettingsClick?: () => void;
    onGridScaleChange?: (scale: number) => void;
    onGridModeChange?: (mode: GridMode) => void;
    onPropsVisibilityChange?: (visible: boolean) => void;
  }

  let {
    sequence = null,
    currentStepIndex = 0,
    isPlaying = false,
    bpm = 60,
    isCameraReady = false,
    isDetectionReady = false,
    isDetectionActive = false,
    isPerforming = false,
    currentFrame = null,
    expectedPositions = null,
    mode = TrainMode.SETUP,
    practiceMode = PracticeMode.TIMED,
    countdownValue = null,
    currentScore = 0,
    currentCombo = 0,
    lastHitResult = null,
    lastHitPoints = 0,
    gridScale = 1.0,
    gridMode = GridMode.DIAMOND,
    propsVisible = true,
    canStartPerformance = false,
    onCameraReady,
    onCameraError,
    onFrame,
    onStepSelect,
    onBrowseSequences,
    onPlayStop,
    onModeClick,
    onSettingsClick,
    onGridScaleChange,
    onGridModeChange,
    onPropsVisibilityChange,
  }: Props = $props();

  // Track if grid settings panel is expanded
  let showGridSettings = $state(false);

  // Extract propType from sequence (from first step's motion)
  const propType = $derived(sequence?.steps?.[0]?.motions?.left?.propType ?? null);
</script>

<div class="bento-layout">
  <!-- Camera Section -->
  <section class="camera-cell">
    <CameraSection
      {isCameraReady}
      {isDetectionReady}
      {isDetectionActive}
      {isPerforming}
      {currentFrame}
      {expectedPositions}
      {mode}
      {countdownValue}
      {currentScore}
      {currentCombo}
      {lastHitResult}
      {lastHitPoints}
      {bpm}
      {gridScale}
      {gridMode}
      {propsVisible}
      {propType}
      {sequence}
      {currentStepIndex}
      {onCameraReady}
      {onCameraError}
      {onFrame}
    />
  </section>

  <!-- Right Column (desktop) / Bottom Stack (mobile) -->
  <div class="content-column">
    <!-- Sequence Info (when loaded) -->
    {#if sequence}
      <section class="sequence-cell">
        <button class="sequence-info" onclick={onBrowseSequences}>
          <span class="seq-name">{sequence.word || sequence.name}</span>
          <span class="seq-meta">{t('train_step_count', { count: sequence.steps?.length || 0 })}</span>
          <i class="fas fa-exchange-alt" aria-hidden="true"></i>
        </button>
      </section>
    {/if}

    <!-- Beat Grid -->
    <section class="grid-cell">
      <GridSection
        {sequence}
        {currentStepIndex}
        {onStepSelect}
        {onBrowseSequences}
      />
    </section>

    <!-- Grid Settings (collapsible) -->
    <section class="settings-cell" class:expanded={showGridSettings}>
      <button
        class="settings-toggle"
        onclick={() => (showGridSettings = !showGridSettings)}
        aria-expanded={showGridSettings}
        aria-controls="grid-settings-panel"
      >
        <i class="fas fa-sliders-h" aria-hidden="true"></i>
        <span>{t('train_grid_settings')}</span>
        <i
          class="fas fa-chevron-{showGridSettings ? 'up' : 'down'} toggle-icon"
          aria-hidden="true"
        ></i>
      </button>

      {#if showGridSettings}
        <div class="bento-grid-settings" id="grid-settings-panel">
          <GridSettingsInline
            {gridScale}
            {gridMode}
            {propsVisible}
            {onGridScaleChange}
            {onGridModeChange}
            {onPropsVisibilityChange}
          />
        </div>
      {/if}
    </section>

    <!-- Control Bar -->
    <section class="controls-cell">
      <ControlBar
        {mode}
        {practiceMode}
        hasSequence={!!sequence}
        {canStartPerformance}
        {isCameraReady}
        {onPlayStop}
        {onModeClick}
        onSequenceClick={onBrowseSequences}
        {onSettingsClick}
      />
    </section>
  </div>
</div>

<style>
  .bento-layout {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    container-type: size;
    overflow: hidden;
  }

  /* Cells share common styling */
  .camera-cell,
  .sequence-cell,
  .grid-cell,
  .settings-cell,
  .controls-cell {
    border-radius: 12px;
    overflow: hidden;
  }

  .camera-cell {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
  }

  .content-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .sequence-cell {
    flex-shrink: 0;
  }

  .sequence-info {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 12%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 8%,
        transparent
      )
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 25%,
        transparent
      );
    border-radius: 10px;
    color: var(--theme-text, var(--theme-text));
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .sequence-info:hover {
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 18%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 12%,
        transparent
      )
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 40%,
      transparent
    );
  }

  .seq-name {
    font-weight: 600;
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seq-meta {
    font-size: 0.75rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .sequence-info i {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--semantic-success) 80%, transparent);
  }

  .grid-cell {
    flex: 1 1 auto;
    min-height: 120px;
    display: flex;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
  }

  .settings-cell {
    flex-shrink: 0;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
  }

  .settings-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: transparent;
    border: none;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .settings-toggle:hover {
    background: var(--theme-card-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .settings-toggle span {
    flex: 1;
    text-align: left;
  }

  .toggle-icon {
    font-size: var(--font-size-compact, 12px);
    transition: transform var(--duration-normal);
  }

  .bento-grid-settings {
    padding: 0 14px 14px;
  }

  .controls-cell {
    flex-shrink: 0;
  }

  /* ============================================
     TABLET / DESKTOP (side-by-side)
     ============================================ */
  @container (min-width: 600px) {
    .bento-layout {
      flex-direction: row;
      gap: 12px;
      padding: 12px;
    }

    .camera-cell {
      flex: 1 1 55%;
      max-width: 55%;
    }

    .content-column {
      flex: 1 1 45%;
      max-width: 45%;
    }

    .grid-cell {
      flex: 1 1 auto;
    }
  }

  @container (min-width: 900px) {
    .bento-layout {
      gap: 16px;
      padding: 16px;
    }

    .camera-cell {
      flex: 1 1 50%;
      max-width: 50%;
    }

    .content-column {
      flex: 1 1 50%;
      max-width: 50%;
      gap: 12px;
    }

    .sequence-info {
      padding: 12px 16px;
      font-size: 0.9rem;
    }

    .settings-toggle {
      padding: 12px 16px;
      font-size: 0.85rem;
    }

    .bento-grid-settings {
      padding: 0 16px 16px;
    }
  }
</style>
