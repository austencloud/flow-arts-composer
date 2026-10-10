<!--
  CameraSection.svelte - Camera preview with detection overlay for Practice tab

  Displays the camera feed with grid overlay and detection status indicators.
  Uses AnimatorCanvas with orchestrator for proper prop animation.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import CameraPreview from "#lib/shared/train/components/CameraPreview.svelte";
  import GridOverlay from "../GridOverlay.svelte";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { TrainMode } from "../../domain/enums/train-enums";
  import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPositionDetector } from "#lib/features/train/get-position-detector.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  interface Props {
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
    bpm?: number;
    gridScale?: number;
    gridMode?: GridMode;
    propsVisible?: boolean;
    propType?: PropType | null;
    sequence?: SequenceData | null;
    currentStepIndex?: number;
    onCameraReady?: () => void;
    onCameraError?: (error: string) => void;
    onFrame?: (video: HTMLVideoElement) => void;
    onGridSettingsClick?: () => void;
  }

  let {
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
    bpm = 60,
    gridScale = 1.0,
    gridMode = GridMode.DIAMOND,
    propsVisible = true,
    propType = null,
    sequence = null,
    currentStepIndex = 0,
    onCameraReady,
    onCameraError,
    onFrame,
    onGridSettingsClick,
  }: Props = $props();

  // Performance monitoring
  const detectionService = getPositionDetector();
  let fps = $state(0);
  let avgFrameTime = $state(0);
  let videoResolution = $state("N/A");
  let perfInterval: number | null = null;

  // Beat interpolation for smooth animation
  let fractionalBeat = $state(0);
  let stepAnimFrameId: number | null = null;
  let beatStartTime = 0;

  // Track beat changes and start interpolation
  let lastStepIndex = -1;
  $effect(() => {
    if (currentStepIndex !== lastStepIndex) {
      lastStepIndex = currentStepIndex;
      beatStartTime = performance.now();
      if (!stepAnimFrameId && isPerforming) {
        startStepAnimation();
      }
    }
  });

  // Start/stop animation based on performance state
  $effect(() => {
    if (isPerforming && !stepAnimFrameId) {
      beatStartTime = performance.now();
      startStepAnimation();
    } else if (!isPerforming && stepAnimFrameId) {
      cancelAnimationFrame(stepAnimFrameId);
      stepAnimFrameId = null;
      fractionalBeat = currentStepIndex;
    }
  });

  function startStepAnimation() {
    function animate() {
      const elapsed = performance.now() - beatStartTime;
      const beatDuration = (60 / bpm) * 1000;
      const progress = Math.min(elapsed / beatDuration, 1.0);

      fractionalBeat = currentStepIndex + progress;

      if (isPerforming) {
        stepAnimFrameId = requestAnimationFrame(animate);
      } else {
        stepAnimFrameId = null;
      }
    }
    stepAnimFrameId = requestAnimationFrame(animate);
  }

  onMount(() => {
    // Update performance stats every 500ms
    perfInterval = window.setInterval(() => {
      if (detectionService?.getPerformanceStats) {
        const stats = detectionService.getPerformanceStats();
        fps = stats.fps;
        avgFrameTime = stats.avgFrameTime;
        videoResolution = stats.videoResolution;
      }
    }, 500);
  });

  onDestroy(() => {
    if (perfInterval !== null) {
      clearInterval(perfInterval);
    }
    if (stepAnimFrameId !== null) {
      cancelAnimationFrame(stepAnimFrameId);
    }
  });
</script>

<div class="camera-section">
  <CameraPreview {onCameraReady} {onCameraError} {onFrame} mirrored={true}>
    <!-- Grid overlay with detection feedback (hide circles when showing props) -->
    <GridOverlay
      leftPosition={currentFrame?.left ?? null}
      rightPosition={currentFrame?.right ?? null}
      expectedLeft={expectedPositions?.left ?? null}
      expectedRight={expectedPositions?.right ?? null}
      showExpected={mode === TrainMode.PERFORMING && !propType}
      {bpm}
      {isPerforming}
      {gridScale}
      {gridMode}
    />

    <!-- AnimatorCanvas for prop rendering (uses orchestrator for correct motion) -->
    {#if sequence && propType && propsVisible}
      <div class="animator-overlay" style="transform: scale({gridScale})">
        <AnimatorCanvas
          leftProp={null}
          rightProp={null}
          sequenceData={sequence}
          currentStep={fractionalBeat}
          gridVisible={false}
          backgroundAlpha={0}
          isPlaying={isPerforming}
        />
      </div>
    {/if}
  </CameraPreview>

  <!-- Grid Settings Button (floating in top-right of camera) -->
  {#if onGridSettingsClick}
    <button
      class="grid-settings-btn"
      onclick={onGridSettingsClick}
      aria-label="Grid settings"
    >
      <i class="fas fa-cog" aria-hidden="true"></i>
    </button>
  {/if}

  <!-- Countdown overlay -->
  {#if mode === TrainMode.COUNTDOWN && countdownValue !== null}
    <div class="countdown-overlay">
      <span class="countdown-number">{countdownValue || t('train_go')}</span>
    </div>
  {/if}

  <!-- Performance Feedback -->
  {#if isPerforming}
    <div class="performance-overlay">
      <div class="score-display">
        {#if currentCombo > 0}
          <div class="combo">
            <span class="combo-value">{currentCombo}x</span>
            <span class="combo-label">{t('train_combo_label')}</span>
          </div>
        {/if}
        <div class="score">
          <span class="score-value">{currentScore}</span>
        </div>
      </div>
      {#if lastHitResult !== null}
        <div
          class="hit-indicator"
          class:hit={lastHitResult}
          class:miss={!lastHitResult}
        >
          {lastHitResult ? `+${lastHitPoints}` : t('train_miss')}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .camera-section {
    position: relative;
    aspect-ratio: 1;
    /* Let the square size itself based on available space */
    max-width: 100%;
    max-height: 100%;
    background: transparent;
    border-radius: 12px;
    overflow: hidden;
  }

  /* AnimatorCanvas overlay - positioned over camera feed */
  .animator-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 5; /* Between grid (10) and camera (0) */
  }

  /* Override AnimatorCanvas's white background to make it transparent */
  .animator-overlay :global(.canvas-wrapper),
  .animator-overlay :global(.canvas-wrapper) :global(canvas),
  .animator-overlay :global(canvas) {
    background: transparent !important;
    background-color: transparent !important;
    border: none !important;
  }

  /* Ensure PixiJS canvas is also transparent */
  .animator-overlay :global(canvas[data-pixi]) {
    background: transparent !important;
    background-color: transparent !important;
  }

  /* Grid Settings Button - floating in top-right */
  .grid-settings-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 1rem;
    cursor: pointer;
    z-index: 20;
    transition: all var(--duration-normal);
  }

  .grid-settings-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, var(--theme-text));
    transform: scale(1.05);
  }

  .grid-settings-btn:active {
    transform: scale(0.95);
  }

  /* On mobile (stacked), limit by height */
  @media (max-width: 767px) {
    .camera-section {
      width: auto;
      height: 100%;
    }
  }

  /* On desktop (side-by-side), limit by width */
  @media (min-width: 768px) {
    .camera-section {
      width: 100%;
      height: auto;
    }
  }

  /* Countdown Overlay */
  .countdown-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    z-index: 30;
  }

  .countdown-number {
    font-size: clamp(3rem, 15vw, 6rem);
    font-weight: bold;
    color: var(--theme-text, white);
    text-shadow: 0 0 40px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 80%,
        transparent
      );
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  /* Performance Overlay */
  .performance-overlay {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    pointer-events: none;
    z-index: 20;
  }

  .score-display {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-weight: 600;
  }

  .combo {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .combo-value {
    font-size: 1.125rem;
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .combo-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .score-value {
    font-size: 1.25rem;
    color: var(--semantic-info, var(--semantic-info));
  }

  .hit-indicator {
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-weight: bold;
    font-size: 1rem;
    animation: fadeInOut 0.8s ease-out forwards;
  }

  .hit-indicator.hit {
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 90%,
      transparent
    );
    color: var(--theme-text, white);
  }

  .hit-indicator.miss {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 90%,
      transparent
    );
    color: var(--theme-text, white);
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: scale(0.8);
    }
    20% {
      opacity: 1;
      transform: scale(1.1);
    }
    80% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .countdown-number {
      animation: none;
    }
    .hit-indicator {
      animation: none;
    }
  }
</style>
