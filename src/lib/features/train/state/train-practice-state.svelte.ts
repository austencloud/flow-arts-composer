/**
 * Train Practice State
 *
 * Manages practice mode settings and configuration for the Practice tab.
 * Also persists last-used sequence and recent sequence history for quick resume.
 */

import { PracticeMode } from "../domain/enums/train-enums";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

const MAX_RECENT_SEQUENCES = 3;

/**
 * Display View - controls WHAT visualization panels are shown
 * - camera-canvas: Camera + AnimatorCanvas (side-by-side)
 * - camera-grid: Camera + StepGrid (current default)
 * - camera-canvas-grid: Camera + AnimatorCanvas + StepGrid (all three)
 */
type DisplayView = "camera-canvas" | "camera-grid" | "camera-canvas-grid";
const DISPLAY_VIEWS: DisplayView[] = [
  "camera-canvas",
  "camera-grid",
  "camera-canvas-grid",
];

interface AdaptiveConfig {
  sensitivity: number; // Frames to match before advancing (5-30)
  autoAdvance: boolean;
}

interface StepConfig {
  voiceCues: boolean;
  voiceKeyword: string; // Default: "next"
  requiredConfirmation: "tap" | "voice" | "both";
}

interface TimedConfig {
  bpm: number;
  strictTiming: boolean;
  showTimingFeedback: boolean;
}

interface RecentSequence {
  id: string;
  name: string;
  word?: string;
  stepCount: number;
  lastPracticedAt: number; // timestamp
}

interface PracticeState {
  currentMode: PracticeMode;
  displayView: DisplayView;
  adaptiveConfig: AdaptiveConfig;
  stepConfig: StepConfig;
  timedConfig: TimedConfig;
  // Sequence persistence
  lastSequenceId: string | null;
  lastSequenceData: SequenceData | null;
  recentSequences: RecentSequence[];
  // Grid overlay settings
  gridScale: number; // 0.5 to 1.5, default 1.0
  gridMode: GridMode; // BOX (cardinal) or DIAMOND (intercardinal)
  propsVisible: boolean; // Toggle prop visibility on camera overlay
}

const DEFAULT_STATE: PracticeState = {
  currentMode: PracticeMode.TIMED,
  displayView: "camera-grid",
  adaptiveConfig: {
    sensitivity: 10,
    autoAdvance: true,
  },
  stepConfig: {
    voiceCues: true,
    voiceKeyword: "next",
    requiredConfirmation: "tap",
  },
  timedConfig: {
    bpm: 120,
    strictTiming: true,
    showTimingFeedback: true,
  },
  lastSequenceId: null,
  lastSequenceData: null,
  recentSequences: [],
  gridScale: 1.0,
  gridMode: GridMode.DIAMOND,
  propsVisible: true,
};

export function createTrainPracticeState() {
  // Load from localStorage if available (with SSR guard)
  let savedState: Partial<PracticeState> = {};
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("train-practice-state");
      if (saved) {
        savedState = JSON.parse(saved);
      }
    } catch (error) {
      console.warn(
        "[train-practice-state] Failed to load from localStorage:",
        error
      );
    }
  }

  const state = $state<PracticeState>({
    ...DEFAULT_STATE,
    ...savedState,
  });

  function setMode(mode: PracticeMode) {
    state.currentMode = mode;
    persistSettings();
  }

  function updateAdaptiveConfig(config: Partial<AdaptiveConfig>) {
    state.adaptiveConfig = { ...state.adaptiveConfig, ...config };
    persistSettings();
  }

  function updateStepConfig(config: Partial<StepConfig>) {
    state.stepConfig = { ...state.stepConfig, ...config };
    persistSettings();
  }

  function updateTimedConfig(config: Partial<TimedConfig>) {
    state.timedConfig = { ...state.timedConfig, ...config };
    persistSettings();
  }

  function getCurrentModeConfig(): AdaptiveConfig | StepConfig | TimedConfig {
    switch (state.currentMode) {
      case PracticeMode.ADAPTIVE:
        return state.adaptiveConfig;
      case PracticeMode.STEP_BY_STEP:
        return state.stepConfig;
      case PracticeMode.TIMED:
        return state.timedConfig;
    }
  }

  /**
   * Set the grid scale (0.5 to 1.5)
   */
  function setGridScale(scale: number) {
    state.gridScale = Math.max(0.5, Math.min(1.5, scale));
    persistSettings();
  }

  /**
   * Set the grid mode (BOX or DIAMOND)
   */
  function setGridMode(mode: GridMode) {
    state.gridMode = mode;
    persistSettings();
  }

  /**
   * Toggle prop visibility on camera overlay
   */
  function setPropsVisible(visible: boolean) {
    state.propsVisible = visible;
    persistSettings();
  }

  /**
   * Set the display view (what visualization panels are shown)
   */
  function setDisplayView(view: DisplayView) {
    state.displayView = view;
    persistSettings();
  }

  /**
   * Cycle through display views: camera-canvas -> camera-grid -> camera-canvas-grid -> ...
   */
  function cycleDisplayView() {
    const currentIndex = DISPLAY_VIEWS.indexOf(state.displayView);
    const nextIndex = (currentIndex + 1) % DISPLAY_VIEWS.length;
    state.displayView = DISPLAY_VIEWS[nextIndex] as DisplayView;
    persistSettings();
  }

  /**
   * Set the last-used sequence for quick resume on next visit
   */
  function setLastSequence(sequence: SequenceData) {
    state.lastSequenceId = sequence.id;
    state.lastSequenceData = sequence;
    persistSettings();
  }

  /**
   * Clear the last-used sequence (e.g., when user clicks back)
   */
  function clearLastSequence() {
    state.lastSequenceId = null;
    state.lastSequenceData = null;
    persistSettings();
  }

  /**
   * Add a sequence to recent history after a training session completes
   */
  function addToRecentSequences(sequence: SequenceData) {
    const recentEntry: RecentSequence = {
      id: sequence.id,
      name: sequence.name ?? sequence.word ?? "Untitled",
      word: sequence.word,
      stepCount: sequence.steps?.length ?? 0,
      lastPracticedAt: Date.now(),
    };

    // Remove if already exists (will re-add at front)
    const filtered = state.recentSequences.filter((s) => s.id !== sequence.id);

    // Add to front and limit to MAX_RECENT_SEQUENCES
    state.recentSequences = [recentEntry, ...filtered].slice(
      0,
      MAX_RECENT_SEQUENCES
    );
    persistSettings();
  }

  /**
   * Check if we have a sequence ready for instant resume
   */
  function hasLastSequence(): boolean {
    return state.lastSequenceId !== null && state.lastSequenceData !== null;
  }

  function persistSettings() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("train-practice-state", JSON.stringify(state));
      } catch (error) {
        console.warn(
          "[train-practice-state] Failed to persist settings:",
          error
        );
      }
    }
  }

  return {
    get currentMode() {
      return state.currentMode;
    },
    get displayView() {
      return state.displayView;
    },
    get adaptiveConfig() {
      return state.adaptiveConfig;
    },
    get stepConfig() {
      return state.stepConfig;
    },
    get timedConfig() {
      return state.timedConfig;
    },
    get lastSequenceId() {
      return state.lastSequenceId;
    },
    get lastSequenceData() {
      return state.lastSequenceData;
    },
    get recentSequences() {
      return state.recentSequences;
    },
    get gridScale() {
      return state.gridScale;
    },
    get gridMode() {
      return state.gridMode;
    },
    get propsVisible() {
      return state.propsVisible;
    },
    setMode,
    setDisplayView,
    cycleDisplayView,
    setGridScale,
    setGridMode,
    setPropsVisible,
    updateAdaptiveConfig,
    updateStepConfig,
    updateTimedConfig,
    getCurrentModeConfig,
    setLastSequence,
    clearLastSequence,
    addToRecentSequences,
    hasLastSequence,
    persistSettings,
  };
}

// Global singleton instance
let practiceStateInstance: ReturnType<typeof createTrainPracticeState> | null =
  null;

export function getTrainPracticeState() {
  if (!practiceStateInstance) {
    practiceStateInstance = createTrainPracticeState();
  }
  return practiceStateInstance;
}

export type {
  AdaptiveConfig,
  StepConfig,
  TimedConfig,
  PracticeState,
  RecentSequence,
  DisplayView,
};
