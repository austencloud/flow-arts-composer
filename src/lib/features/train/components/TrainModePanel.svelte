<!--
  TrainModePanel.svelte - Main Train Mode Panel

  Full-screen training interface with camera preview and beat visualization.
  Responsive layout that works on all device sizes.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount, onDestroy } from "svelte";
  import { createTrainState } from "../state/train-state.svelte";
  import { TrainMode, PracticeMode } from "../domain/enums/train-enums";
  import type {
    AdaptiveConfig,
    StepConfig,
    TimedConfig,
  } from "../state/train-practice-state.svelte";
  import ResultsScreen from "./ResultsScreen.svelte";
  import type { MediaPipeDetector } from "../services/media-pipe-detector";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { getSessionCompletionProcessor } from "#lib/features/train/get-session-completion-processor.js";
  import { getPositionDetector } from "#lib/features/train/get-position-detector.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { getTrainPracticeState } from "../state/train-practice-state.svelte";
  import ModeSettingsSheet from "./practice/ModeSettingsSheet.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import PracticeBentoLayout from "./practice/PracticeBentoLayout.svelte";
  import ModePickerSheet from "./practice/ModePickerSheet.svelte";
  import GridSettingsSheet from "./practice/GridSettingsSheet.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { createScreenWakeLockManager } from "#lib/shared/device/services/screen-wake-lock-manager.js";

  interface Props {
    sequence?: SequenceData | null;
    practiceMode?: PracticeMode;
    modeConfig?: AdaptiveConfig | StepConfig | TimedConfig;
    onSequenceSelect?: (sequence: SequenceData) => void;
    onSequenceClear?: () => void;
    onSessionComplete?: () => void;
  }

  let {
    sequence = null,
    practiceMode = PracticeMode.TIMED,
    modeConfig,
    onSequenceSelect,
    onSequenceClear,
    onSessionComplete,
  }: Props = $props();

  // Practice state for mode switching and settings
  const practiceState = getTrainPracticeState();

  // UI sheet states
  let showSettingsSheet = $state(false);
  let showSequenceBrowser = $state(false);
  let showModePicker = $state(false);
  let showGridSettings = $state(false);

  const trainState = createTrainState();
  const screenWakeLockManager = createScreenWakeLockManager();

  // Services
  let detectionService: MediaPipeDetector | null = $state(null);
  const hapticService = getHapticFeedback();
  let isDetectionReady = $state(false);
  const sessionCompletionProcessor = getSessionCompletionProcessor();

  // Session tracking
  let sessionStartTime = 0;
  let hasProcessedSession = false;

  // Timing system (using requestAnimationFrame for better performance)
  let stepAnimationFrameId: number | null = null;
  let lastStepTime = 0;
  let stepDuration = 0;

  // Hit detection tracking
  let hasCheckedCurrentBeat = false;
  let lastHitResult: boolean | null = $state(null);
  let lastHitPoints = $state(0);

  // Beat selection for setup mode (manual beat preview)
  // -1 = start position, 0+ = actual steps (0-indexed)
  let selectedStepIndex = $state(-1);

  // Determine which beat index to show - selected during setup, current during performance
  const displayStepIndex = $derived(
    trainState.isPerforming ? trainState.currentStepIndex : selectedStepIndex
  );

  // Set sequence if provided
  $effect(() => {
    if (sequence) {
      trainState.setSequence(sequence);
    }
  });

  async function initDetection() {
    try {
      detectionService = getPositionDetector();
      if (detectionService) {
        await detectionService.initialize();
        isDetectionReady = true;
      }
    } catch (error) {
      console.error("Failed to initialize detection:", error);
      trainState.setError(
        t('train_detection_init_failed')
      );
    }
  }

  function handleCameraReady() {
    trainState.setCameraReady(true);
  }

  function handleCameraError(error: string) {
    trainState.setError(`Camera error: ${error}`);
    trainState.setCameraReady(false);
  }

  let currentVideoElement: HTMLVideoElement | null = null;

  async function handleFrame(video: HTMLVideoElement) {
    currentVideoElement = video; // Store reference for mode changes
    if (!detectionService || !isDetectionReady || !trainState.isCameraReady)
      return;

    try {
      // Start detection if not already active
      if (!trainState.isDetectionActive) {
        trainState.setDetectionActive(true);
        await detectionService.startRealTimeDetection(
          video,
          (frame) => {
            trainState.updateDetectionFrame(frame);
          },
          { mirrored: true, gridMode: practiceState.gridMode }
        );
      }
    } catch (error) {
      console.error("Detection error:", error);
      // Tracking failed to start: clear the active flag so it doesn't die
      // silently, and surface the failure on the panel's error state.
      trainState.setDetectionActive(false);
      trainState.setError(t('train_detection_start_failed'));
    }
  }

  // Restart detection when gridMode changes
  $effect(() => {
    const currentMode = practiceState.gridMode;

    // Only restart if detection is already active and we have a video element
    if (
      !trainState.isDetectionActive ||
      !detectionService ||
      !currentVideoElement
    ) {
      return;
    }

    // Stop current detection
    detectionService.stopDetection();
    trainState.setDetectionActive(false);

    // Restart with new mode
    const restartTimer = setTimeout(async () => {
      if (
        currentVideoElement &&
        detectionService &&
        trainState.isCameraReady
      ) {
        try {
          trainState.setDetectionActive(true);
          await detectionService.startRealTimeDetection(
            currentVideoElement,
            (frame) => {
              trainState.updateDetectionFrame(frame);
            },
            { mirrored: true, gridMode: currentMode }
          );
        } catch (error) {
          console.error("Detection restart error:", error);
          trainState.setDetectionActive(false);
          trainState.setError(t('train_detection_start_failed'));
        }
      }
    }, 50); // Small delay to ensure clean restart

    return () => clearTimeout(restartTimer);
  });

  function handleStartCountdown() {
    hapticService?.trigger("selection");
    // Skip countdown - start immediately for faster testing
    screenWakeLockManager.setActive(true);
    trainState.startPerformance();
  }

  function handleBackToSetup() {
    hapticService?.trigger("selection");
    stopBeatTimer();
    if (detectionService) {
      detectionService.stopDetection();
    }
    trainState.setDetectionActive(false);
    trainState.resetToSetup();
  }

  // Timing system - start beat timer when performance begins
  $effect(() => {
    screenWakeLockManager.setActive(trainState.isPerforming);

    if (trainState.isPerforming && !stepAnimationFrameId) {
      startStepTimer();
      // Record session start time
      sessionStartTime = Date.now();
      hasProcessedSession = false;
    } else if (!trainState.isPerforming && stepAnimationFrameId) {
      stopBeatTimer();
    }
  });

  // Process session completion when entering REVIEW mode
  $effect(() => {
    if (trainState.mode === TrainMode.REVIEW && !hasProcessedSession) {
      hasProcessedSession = true;
      processSessionCompletion();
    }
  });

  async function processSessionCompletion() {
    const duration = Date.now() - sessionStartTime;

    await sessionCompletionProcessor.processCompletion({
      totalSteps: trainState.totalSteps,
      totalHits: trainState.totalHits,
      totalMisses: trainState.totalMisses,
      maxCombo: trainState.maxCombo,
      currentScore: trainState.currentScore,
      bpm: trainState.bpm,
      practiceMode: practiceState.currentMode,
      sequenceId: sequence?.id,
      sequenceName: sequence?.word ?? sequence?.name,
      sessionDuration: duration,
    });
  }

  function startStepTimer() {
    stepDuration = (60 / trainState.bpm) * 1000;
    lastStepTime = performance.now();
    hasCheckedCurrentBeat = false;

    // Use requestAnimationFrame for better performance:
    // - Automatically pauses when tab is hidden
    // - Syncs with display refresh rate
    // - More efficient than setInterval
    function tick() {
      const now = performance.now();
      const elapsed = now - lastStepTime;

      if (elapsed >= stepDuration) {
        lastStepTime = now;
        hasCheckedCurrentBeat = false;
        trainState.advanceBeat();
      }

      // Continue the loop if still performing
      if (trainState.isPerforming) {
        stepAnimationFrameId = requestAnimationFrame(tick);
      }
    }

    stepAnimationFrameId = requestAnimationFrame(tick);
  }

  // Hit detection
  $effect(() => {
    if (!trainState.isPerforming || hasCheckedCurrentBeat) return;
    if (!trainState.currentFrame || !trainState.expectedPositions) return;

    const expected = trainState.expectedPositions;
    const detected = trainState.currentFrame;

    const leftCorrect =
      expected.left && detected.left
        ? detected.left.quadrant === expected.left
        : expected.left === null;

    const rightCorrect =
      expected.right && detected.right
        ? detected.right.quadrant === expected.right
        : expected.right === null;

    const isHit = leftCorrect && rightCorrect;

    const basePoints = 100;
    const comboMultiplier = 1 + trainState.currentCombo * 0.1;
    const points = Math.floor(basePoints * comboMultiplier);

    trainState.recordHit(isHit, points);
    lastHitResult = isHit;
    lastHitPoints = points;
    hasCheckedCurrentBeat = true;
  });

  function stopBeatTimer() {
    if (stepAnimationFrameId) {
      cancelAnimationFrame(stepAnimationFrameId);
      stepAnimationFrameId = null;
    }
  }

  function handleSelectSequence(selectedSequence: SequenceData) {
    trainState.setSequence(selectedSequence);
    showSequenceBrowser = false;
    // Reset beat selection to start position when sequence changes
    selectedStepIndex = -1;
    onSequenceSelect?.(selectedSequence);
  }

  function handleStepSelect(stepIndex: number) {
    // Only allow beat selection during setup mode
    if (!trainState.isPerforming) {
      selectedStepIndex = stepIndex;
      hapticService?.trigger("selection");
    }
  }

  function handleOpenSequenceBrowser() {
    hapticService?.trigger("selection");
    showSequenceBrowser = true;
  }

  function handleCloseSequenceBrowser() {
    showSequenceBrowser = false;
  }

  onMount(() => {
    initDetection();
  });

  onDestroy(() => {
    screenWakeLockManager.dispose();
    stopBeatTimer();
    if (detectionService) {
      detectionService.stopDetection();
      detectionService.dispose();
    }
  });
</script>

<div class="train-mode-panel">
  <!-- Unified Bento Layout - Everything in flow, no floaters! -->
  <div class="training-mode-body">
    <PracticeBentoLayout
      sequence={trainState.sequence}
      currentStepIndex={displayStepIndex}
      isPlaying={trainState.isPerforming}
      bpm={trainState.bpm}
      isCameraReady={trainState.isCameraReady}
      {isDetectionReady}
      isDetectionActive={trainState.isDetectionActive}
      isPerforming={trainState.isPerforming}
      currentFrame={trainState.currentFrame}
      expectedPositions={trainState.expectedPositions}
      mode={trainState.mode}
      practiceMode={practiceState.currentMode}
      countdownValue={trainState.countdownValue}
      currentScore={trainState.currentScore}
      currentCombo={trainState.currentCombo}
      {lastHitResult}
      {lastHitPoints}
      gridScale={practiceState.gridScale}
      gridMode={practiceState.gridMode}
      propsVisible={practiceState.propsVisible}
      canStartPerformance={trainState.canStartPerformance}
      onCameraReady={handleCameraReady}
      onCameraError={handleCameraError}
      onFrame={handleFrame}
      onStepSelect={handleStepSelect}
      onBrowseSequences={handleOpenSequenceBrowser}
      onPlayStop={trainState.mode === TrainMode.PERFORMING
        ? handleBackToSetup
        : handleStartCountdown}
      onModeClick={() => {
        showModePicker = true;
      }}
      onSettingsClick={() => {
        showSettingsSheet = true;
      }}
      onGridScaleChange={(scale) => practiceState.setGridScale(scale)}
      onGridModeChange={(mode) => practiceState.setGridMode(mode)}
      onPropsVisibilityChange={(visible) =>
        practiceState.setPropsVisible(visible)}
    />

    <!-- Results Screen Overlay -->
    {#if trainState.mode === TrainMode.REVIEW}
      <ResultsScreen
        totalSteps={trainState.totalSteps}
        hits={trainState.totalHits}
        misses={trainState.totalMisses}
        maxCombo={trainState.maxCombo}
        finalScore={trainState.currentScore}
        sequenceName={trainState.sequence?.name || trainState.sequence?.word}
        onPlayAgain={handleBackToSetup}
        onExit={() => {
          handleBackToSetup();
          onSequenceClear?.();
        }}
      />
    {/if}
  </div>

  <!-- Error Toast -->
  {#if trainState.error}
    <div class="error-toast" role="alert" aria-live="assertive">
      <p>{trainState.error}</p>
      <button
        onclick={() => {
          hapticService?.trigger("selection");
          trainState.setError(null);
        }}>✕</button
      >
    </div>
  {/if}

  <!-- Mode Settings Sheet -->
  <ModeSettingsSheet
    bind:isOpen={showSettingsSheet}
    onClose={() => (showSettingsSheet = false)}
    currentMode={practiceState.currentMode}
    adaptiveConfig={practiceState.adaptiveConfig}
    stepConfig={practiceState.stepConfig}
    timedConfig={practiceState.timedConfig}
    onAdaptiveConfigUpdate={(config) =>
      practiceState.updateAdaptiveConfig(config)}
    onStepConfigUpdate={(config) => practiceState.updateStepConfig(config)}
    onTimedConfigUpdate={(config) => practiceState.updateTimedConfig(config)}
  />

  <!-- Grid Settings Sheet (bottom sheet on mobile, side drawer on desktop) -->
  <GridSettingsSheet
    bind:isOpen={showGridSettings}
    gridScale={practiceState.gridScale}
    gridMode={practiceState.gridMode}
    propsVisible={practiceState.propsVisible}
    onScaleChange={(scale) => practiceState.setGridScale(scale)}
    onModeChange={(mode) => practiceState.setGridMode(mode)}
    onPropsVisibilityChange={(visible) =>
      practiceState.setPropsVisible(visible)}
    onClose={() => {
      showGridSettings = false;
    }}
  />

  <!-- Mode Picker Sheet -->
  <ModePickerSheet
    bind:isOpen={showModePicker}
    currentMode={practiceState.currentMode}
    onModeChange={(mode) => practiceState.setMode(mode)}
    onClose={() => {
      showModePicker = false;
    }}
  />

  <!-- Sequence Picker Modal -->
  <SequencePickerModal
    open={showSequenceBrowser}
    onSelect={handleSelectSequence}
    onClose={handleCloseSequenceBrowser}
  />
</div>

<style>
  .train-mode-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
    color: var(--theme-text, white);
    overflow: hidden;
  }

  /* Main Content Area */
  .training-mode-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .error-toast {
    position: absolute;
    bottom: 80px;
    left: 12px;
    right: 12px;
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 98%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 98%,
          transparent
        )
        100%
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 30%,
        transparent
      );
    border-radius: 12px;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    z-index: 150;
    animation: slideUp var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 20px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 30%,
        transparent
      );
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .error-toast p {
    margin: 0;
    color: var(--theme-text, white);
    font-size: 0.875rem;
    flex: 1;
  }

  .error-toast button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    background: var(--theme-card-hover-bg);
    border: none;
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: 0.9rem;
    cursor: pointer;
    transition: background var(--duration-normal);
  }

  .error-toast button:hover {
    background: color-mix(in srgb, var(--theme-text, white) 25%, transparent);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .error-toast {
      animation: none;
    }
  }
</style>
