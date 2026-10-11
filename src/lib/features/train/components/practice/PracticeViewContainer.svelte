<!--
  PracticeViewContainer.svelte - Layout manager for Practice tab visualization

  Manages responsive layouts for three display views:
  - camera-canvas: Camera + AnimatorCanvas (side-by-side)
  - camera-grid: Camera + StepGrid (side-by-side)
  - camera-canvas-grid: Camera + AnimatorCanvas + StepGrid (all three)
-->
<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { TrainMode } from "../../domain/enums/train-enums";
  import CameraSection from "./CameraSection.svelte";
  import GridSection from "./GridSection.svelte";

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
    countdownValue?: number | null;
    currentScore?: number;
    currentCombo?: number;
    lastHitResult?: boolean | null;
    lastHitPoints?: number;
    gridScale?: number;
    gridMode?: GridMode;
    propsVisible?: boolean;
    // Callbacks
    onCameraReady?: () => void;
    onCameraError?: (error: string) => void;
    onFrame?: (video: HTMLVideoElement) => void;
    onStepSelect?: (stepIndex: number) => void;
    onBrowseSequences?: () => void;
    onGridSettingsClick?: () => void;
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
    countdownValue = null,
    currentScore = 0,
    currentCombo = 0,
    lastHitResult = null,
    lastHitPoints = 0,
    gridScale = 1.0,
    gridMode = GridMode.DIAMOND,
    propsVisible = true,
    onCameraReady,
    onCameraError,
    onFrame,
    onStepSelect,
    onBrowseSequences,
    onGridSettingsClick,
  }: Props = $props();

  // Always show camera + grid (no display view modes)
  const showGrid = true; // Always show beat grid

  // Extract propType from sequence (from first step's motion)
  const propType = $derived(sequence?.steps?.[0]?.motions?.left?.propType ?? null);
</script>

<div class="view-container">
  <!-- Camera is always shown -->
  <div class="panel camera-panel">
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
      {onGridSettingsClick}
    />
  </div>

  <!-- Beat Grid panel (always shown) -->
  <div class="panel grid-panel">
    <GridSection
      {sequence}
      {currentStepIndex}
      {onStepSelect}
      {onBrowseSequences}
    />
  </div>
</div>

<style>
  .view-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-sm, 12px);
    padding: var(--space-2026-sm, 12px);
    background: transparent;
    overflow: hidden;
  }

  .panel {
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-md, 14px);
    box-shadow: var(--shadow-2026-sm, 0 1px 3px rgba(0, 0, 0, 0.06));
    overflow: hidden;
  }

  /* Camera panel always takes priority space */
  .camera-panel {
    flex: 1 1 auto;
  }

  .grid-panel {
    flex: 1 1 auto;
  }

  /* ============================================
	   DESKTOP LAYOUTS (side-by-side when nav visible)
	   ============================================ */

  @media (min-width: 1024px) {
    .view-container {
      flex-direction: row;
      align-items: stretch;
      gap: 1rem;
      padding: 1rem;
    }

    .camera-panel {
      flex: 1 1 50%;
      max-width: 50%;
      height: 100%;
    }

    .grid-panel {
      flex: 1 1 50%;
      max-width: 50%;
      height: 100%;
    }
  }

  /* Tablet intermediate layout */
  @media (min-width: 768px) and (max-width: 1023px) {
    .view-container {
      flex-direction: row;
      gap: 0.75rem;
      padding: 0.75rem;
    }

    .camera-panel,
    .grid-panel {
      flex: 1 1 50%;
      max-width: 50%;
      height: 100%;
    }
  }
</style>
