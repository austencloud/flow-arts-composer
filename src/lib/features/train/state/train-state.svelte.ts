/**
 * Train Module State Management
 * Uses Svelte 5 runes for reactive state
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { initTrainState, getTrainState } from '#lib/features/train/state';
 *   import { TrainMode } from '#lib/features/train/domain/enums/train-enums.js';
 *
 *   // Initialize state in root component
 *   const trainState = initTrainState({ defaultBpm: 120 });
 *
 *   // Or get state in child components
 *   const state = getTrainState();
 *
 *   // Use reactive state
 *   const canStart = state.canStartPerformance;
 *   const currentMode = state.mode;
 *
 *   // Call actions
 *   function handleStartCountdown() {
 *     state.startCountdown();
 *   }
 * </script>
 *
 * {#if state.mode === TrainMode.SETUP}
 *   <button
 *     disabled={!state.canStartPerformance}
 *     onclick={handleStartCountdown}
 *   >
 *     Start Training
 *   </button>
 * {/if}
 * ```
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
import type { PerformanceData } from "#lib/shared/train/domain/performance-data.js";
import {
  TrainMode,
  VisualizationMode,
  DetectionMethod,
} from "../domain/enums/train-enums";
import { trackTrainSessionStarted } from "../analytics/train-events";

export interface TrainStateConfig {
  defaultBpm: number;
  defaultVisualization: VisualizationMode;
  defaultDetectionMethod: DetectionMethod;
}

const DEFAULT_CONFIG: TrainStateConfig = {
  defaultBpm: 60,
  defaultVisualization: VisualizationMode.TIMELINE,
  defaultDetectionMethod: DetectionMethod.HAND_TRACKING,
};

export function createTrainState(config: Partial<TrainStateConfig> = {}) {
  const settings = { ...DEFAULT_CONFIG, ...config };

  // Core state
  let mode = $state<TrainMode>(TrainMode.SETUP);
  let sequence = $state<SequenceData | null>(null);
  let bpm = $state(settings.defaultBpm);
  let visualizationMode = $state(settings.defaultVisualization);
  let detectionMethod = $state(settings.defaultDetectionMethod);

  // Detection state
  let isDetectionActive = $state(false);
  let isCameraReady = $state(false);
  let currentFrame = $state<DetectionFrame | null>(null);
  let detectionConfidence = $state(0);

  // Performance state (during performing)
  let currentStepIndex = $state(0);
  let currentCombo = $state(0);
  let currentScore = $state(0);
  let performanceStartTime = $state<number | null>(null);
  let totalHits = $state(0);
  let totalMisses = $state(0);
  let maxCombo = $state(0);

  // Results state
  let lastPerformance = $state<PerformanceData | null>(null);

  // Countdown state
  let countdownValue = $state<number | null>(null);

  // Error state
  let error = $state<string | null>(null);

  // Derived state
  const isPerforming = $derived(mode === TrainMode.PERFORMING);
  const hasSequence = $derived(sequence !== null);
  const canStartPerformance = $derived(
    hasSequence && isCameraReady && mode === TrainMode.SETUP
  );
  const totalSteps = $derived(sequence?.steps?.length ?? 0);
  const progress = $derived(
    totalSteps > 0 ? (currentStepIndex / totalSteps) * 100 : 0
  );

  // Current expected positions (derived from sequence and beat index)
  const expectedPositions = $derived.by(() => {
    if (
      !sequence?.steps ||
      currentStepIndex >= sequence.steps.length
    ) {
      return null;
    }
    const beat = sequence.steps[currentStepIndex];
    if (!beat?.motions) return null;

    return {
      left: beat.motions.left?.endLocation ?? null,
      right: beat.motions.right?.endLocation ?? null,
    };
  });

  // Actions
  function setSequence(seq: SequenceData) {
    sequence = seq;
    resetPerformanceState();
  }

  function clearSequence() {
    sequence = null;
    resetPerformanceState();
  }

  function setMode(newMode: TrainMode) {
    mode = newMode;
  }

  function setBpm(newBpm: number) {
    bpm = Math.max(30, Math.min(200, newBpm));
  }

  function setVisualizationMode(vis: VisualizationMode) {
    visualizationMode = vis;
  }

  function setDetectionMethod(method: DetectionMethod) {
    detectionMethod = method;
  }

  function setCameraReady(ready: boolean) {
    isCameraReady = ready;
  }

  function setDetectionActive(active: boolean) {
    isDetectionActive = active;
  }

  function updateDetectionFrame(frame: DetectionFrame) {
    currentFrame = frame;
    // Calculate average confidence
    const leftConf = frame.left?.confidence ?? 0;
    const rightConf = frame.right?.confidence ?? 0;
    detectionConfidence = (leftConf + rightConf) / 2;
  }

  function startCountdown() {
    mode = TrainMode.COUNTDOWN;
    countdownValue = 3;
  }

  function updateCountdown(value: number | null) {
    countdownValue = value;
    if (value === 0) {
      startPerformance();
    }
  }

  function startPerformance() {
    mode = TrainMode.PERFORMING;
    performanceStartTime = performance.now();
    currentStepIndex = 0;
    currentCombo = 0;
    currentScore = 0;
    totalHits = 0;
    totalMisses = 0;
    maxCombo = 0;
    countdownValue = null;
    trackTrainSessionStarted({
      sequenceId: sequence?.id,
      bpm,
      detectionMethod,
      totalSteps,
    });
  }

  function advanceBeat() {
    if (currentStepIndex < totalSteps - 1) {
      currentStepIndex++;
    } else {
      endPerformance();
    }
  }

  function recordHit(isCorrect: boolean, points: number) {
    if (isCorrect) {
      currentCombo++;
      currentScore += points;
      totalHits++;
      if (currentCombo > maxCombo) {
        maxCombo = currentCombo;
      }
    } else {
      currentCombo = 0;
      totalMisses++;
    }
  }

  function endPerformance() {
    mode = TrainMode.REVIEW;
    performanceStartTime = null;
  }

  function setLastPerformance(perf: PerformanceData) {
    lastPerformance = perf;
  }

  function resetPerformanceState() {
    currentStepIndex = 0;
    currentCombo = 0;
    currentScore = 0;
    totalHits = 0;
    totalMisses = 0;
    maxCombo = 0;
    performanceStartTime = null;
    countdownValue = null;
  }

  function resetToSetup() {
    mode = TrainMode.SETUP;
    resetPerformanceState();
    lastPerformance = null;
    error = null;
  }

  function setError(err: string | null) {
    error = err;
  }

  return {
    // State (getters)
    get mode() {
      return mode;
    },
    get sequence() {
      return sequence;
    },
    get bpm() {
      return bpm;
    },
    get visualizationMode() {
      return visualizationMode;
    },
    get detectionMethod() {
      return detectionMethod;
    },
    get isDetectionActive() {
      return isDetectionActive;
    },
    get isCameraReady() {
      return isCameraReady;
    },
    get currentFrame() {
      return currentFrame;
    },
    get detectionConfidence() {
      return detectionConfidence;
    },
    get currentStepIndex() {
      return currentStepIndex;
    },
    get currentCombo() {
      return currentCombo;
    },
    get currentScore() {
      return currentScore;
    },
    get totalHits() {
      return totalHits;
    },
    get totalMisses() {
      return totalMisses;
    },
    get maxCombo() {
      return maxCombo;
    },
    get performanceStartTime() {
      return performanceStartTime;
    },
    get lastPerformance() {
      return lastPerformance;
    },
    get countdownValue() {
      return countdownValue;
    },
    get error() {
      return error;
    },

    // Derived state
    get isPerforming() {
      return isPerforming;
    },
    get hasSequence() {
      return hasSequence;
    },
    get canStartPerformance() {
      return canStartPerformance;
    },
    get totalSteps() {
      return totalSteps;
    },
    get progress() {
      return progress;
    },
    get expectedPositions() {
      return expectedPositions;
    },

    // Actions
    setSequence,
    clearSequence,
    setMode,
    setBpm,
    setVisualizationMode,
    setDetectionMethod,
    setCameraReady,
    setDetectionActive,
    updateDetectionFrame,
    startCountdown,
    updateCountdown,
    startPerformance,
    advanceBeat,
    recordHit,
    endPerformance,
    setLastPerformance,
    resetPerformanceState,
    resetToSetup,
    setError,
  };
}

export type TrainState = ReturnType<typeof createTrainState>;
