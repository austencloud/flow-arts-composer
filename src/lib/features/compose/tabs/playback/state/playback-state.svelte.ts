/**
 * Playback State
 *
 * Unified playback state for the Animate module's Playback tab.
 * Manages sequences, canvas settings, and playback controls across all animation modes.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { DEFAULT_TRAIL_SETTINGS } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { ComposeMode } from "../../../shared/state/compose-module-state.svelte";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import type {
  PlaybackMode,
  StepPlaybackStepSize,
} from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";

const debug = createComponentLogger("PlaybackState");

/**
 * Easing type for beat-to-beat transitions
 * - linear: Constant speed throughout
 * - ease-in: Slow start, fast end (accelerating)
 * - ease-out: Fast start, slow end (decelerating)
 * - ease-in-out: Slow start and end, fast middle
 */
export type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Animation sequence slot for a specific canvas/position
 */
export interface AnimationSequenceSlot {
  sequence: SequenceData | null;
  visible: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
}

/**
 * Per-canvas settings (trail, rotation, etc.)
 */
export interface CanvasSettings {
  id: string;
  trailSettings: TrailSettings;
  rotationOffset?: number; // For grid mode
}

// LocalStorage keys
const STORAGE_KEYS = {
  SPEED: "playback-speed",
  SHOULD_LOOP: "playback-should-loop",
  MOBILE_TOOL_VIEW: "playback-mobile-tool-view",
  PLAYBACK_MODE: "tka_animation_playback_mode",
  STEP_PLAYBACK_PAUSE_MS: "tka_animation_step_playback_pause_ms",
  STEP_PLAYBACK_STEP_SIZE: "tka_animation_step_playback_step_size",
  EASING_TYPE: "tka_animation_easing_type",
} as const;

// Mobile tool view type
export type MobileToolView = "controls" | "step-grid";

export type PlaybackState = {
  // Playback controls
  readonly isPlaying: boolean;
  readonly speed: number;
  readonly shouldLoop: boolean;
  readonly currentStep: number;
  readonly playbackMode: PlaybackMode;
  readonly stepPlaybackPauseMs: number;
  readonly stepPlaybackStepSize: StepPlaybackStepSize;
  readonly easingType: EasingType;

  // Mobile UI state
  readonly mobileToolView: MobileToolView;

  // Current mode
  readonly currentMode: ComposeMode;

  // Sequences
  readonly sequences: AnimationSequenceSlot[];

  // Canvas settings
  readonly canvasSettings: CanvasSettings[];

  // Mutators - Playback
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
  setLoop: (loop: boolean) => void;
  setCurrentStep: (beat: number) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setStepPlaybackPauseMs: (pauseMs: number) => void;
  setStepPlaybackStepSize: (stepSize: StepPlaybackStepSize) => void;
  setEasingType: (easing: EasingType) => void;

  // Mutators - Mode & Sequences
  setCurrentMode: (mode: ComposeMode) => void;
  setSequences: (sequences: AnimationSequenceSlot[]) => void;
  updateSequenceSlot: (
    index: number,
    slot: Partial<AnimationSequenceSlot>
  ) => void;

  // Mutators - Canvas Settings
  updateCanvasSettings: (
    canvasId: string,
    settings: Partial<CanvasSettings>
  ) => void;
  updateTrailSettings: (
    canvasId: string,
    trailSettings: Partial<TrailSettings>
  ) => void;

  // Mutators - Mobile UI
  setMobileToolView: (view: MobileToolView) => void;
  toggleMobileToolView: () => void;

  reset: () => void;
};

// Helper functions for localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch (err) {
    console.warn(`Failed to load ${key} from localStorage:`, err);
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to save ${key} to localStorage:`, err);
  }
}

export function createPlaybackState(): PlaybackState {
  // Playback state
  let isPlaying = $state(false);
  let speed = $state(loadFromStorage(STORAGE_KEYS.SPEED, 1.0));
  let shouldLoop = $state(loadFromStorage(STORAGE_KEYS.SHOULD_LOOP, false));
  let currentStep = $state(0);
  let playbackMode = $state<PlaybackMode>(
    loadFromStorage(STORAGE_KEYS.PLAYBACK_MODE, "continuous")
  );
  let stepPlaybackPauseMs = $state(
    loadFromStorage(STORAGE_KEYS.STEP_PLAYBACK_PAUSE_MS, 250)
  );
  let stepPlaybackStepSize = $state<StepPlaybackStepSize>(
    loadFromStorage(STORAGE_KEYS.STEP_PLAYBACK_STEP_SIZE, 1)
  );
  let easingType = $state<EasingType>(
    loadFromStorage(STORAGE_KEYS.EASING_TYPE, "linear")
  );

  // Mobile UI state
  let mobileToolView = $state<MobileToolView>(
    loadFromStorage(STORAGE_KEYS.MOBILE_TOOL_VIEW, "controls")
  );

  // Current mode
  let currentMode = $state<ComposeMode>("single");

  // Sequences
  let sequences = $state<AnimationSequenceSlot[]>([]);

  // Canvas settings (one per canvas)
  let canvasSettings = $state<CanvasSettings[]>([
    {
      id: "main",
      trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
    },
  ]);

  return {
    // Getters
    get isPlaying() {
      return isPlaying;
    },
    get speed() {
      return speed;
    },
    get shouldLoop() {
      return shouldLoop;
    },
    get currentStep() {
      return currentStep;
    },
    get playbackMode() {
      return playbackMode;
    },
    get stepPlaybackPauseMs() {
      return stepPlaybackPauseMs;
    },
    get stepPlaybackStepSize() {
      return stepPlaybackStepSize;
    },
    get easingType() {
      return easingType;
    },
    get mobileToolView() {
      return mobileToolView;
    },
    get currentMode() {
      return currentMode;
    },
    get sequences() {
      return sequences;
    },
    get canvasSettings() {
      return canvasSettings;
    },

    // Playback controls
    play() {
      isPlaying = true;
    },

    pause() {
      isPlaying = false;
    },

    stop() {
      isPlaying = false;
      currentStep = 0;
    },

    setSpeed(newSpeed: number) {
      speed = Math.max(0.1, Math.min(3.0, newSpeed));
      saveToStorage(STORAGE_KEYS.SPEED, speed);
      debug.log(`Speed set to ${speed}x`);
    },

    setLoop(loop: boolean) {
      shouldLoop = loop;
      saveToStorage(STORAGE_KEYS.SHOULD_LOOP, loop);
    },

    setCurrentStep(beat: number) {
      currentStep = beat;
    },

    setPlaybackMode(mode: PlaybackMode) {
      playbackMode = mode;
      saveToStorage(STORAGE_KEYS.PLAYBACK_MODE, playbackMode);
      debug.log(`Playback mode set to ${playbackMode}`);
    },

    setStepPlaybackPauseMs(pauseMs: number) {
      stepPlaybackPauseMs = Math.max(0, Math.min(2000, Math.round(pauseMs)));
      saveToStorage(STORAGE_KEYS.STEP_PLAYBACK_PAUSE_MS, stepPlaybackPauseMs);
      debug.log(`Step playback pause set to ${stepPlaybackPauseMs}ms`);
    },

    setStepPlaybackStepSize(stepSize: StepPlaybackStepSize) {
      stepPlaybackStepSize = stepSize === 0.5 ? 0.5 : 1;
      saveToStorage(STORAGE_KEYS.STEP_PLAYBACK_STEP_SIZE, stepPlaybackStepSize);
      debug.log(`Step playback step size set to ${stepPlaybackStepSize}`);
    },

    setEasingType(easing: EasingType) {
      const validTypes: EasingType[] = [
        "linear",
        "ease-in",
        "ease-out",
        "ease-in-out",
      ];
      easingType = validTypes.includes(easing) ? easing : "linear";
      saveToStorage(STORAGE_KEYS.EASING_TYPE, easingType);
      debug.log(`Easing type set to ${easingType}`);
    },

    // Mode & Sequences
    setCurrentMode(mode: ComposeMode) {
      currentMode = mode;
    },

    setSequences(newSequences: AnimationSequenceSlot[]) {
      sequences = newSequences;
    },

    updateSequenceSlot(index: number, slot: Partial<AnimationSequenceSlot>) {
      const existing = sequences[index];
      if (index >= 0 && index < sequences.length && existing) {
        sequences[index] = {
          sequence:
            slot.sequence !== undefined ? slot.sequence : existing.sequence,
          visible: slot.visible !== undefined ? slot.visible : existing.visible,
          leftVisible:
            slot.leftVisible !== undefined
              ? slot.leftVisible
              : existing.leftVisible,
          rightVisible:
            slot.rightVisible !== undefined
              ? slot.rightVisible
              : existing.rightVisible,
        };
      }
    },

    // Canvas Settings
    updateCanvasSettings(canvasId: string, settings: Partial<CanvasSettings>) {
      const index = canvasSettings.findIndex((cs) => cs.id === canvasId);
      const existing = canvasSettings[index];
      if (index !== -1 && existing) {
        canvasSettings[index] = {
          id: settings.id !== undefined ? settings.id : existing.id,
          trailSettings:
            settings.trailSettings !== undefined
              ? settings.trailSettings
              : existing.trailSettings,
          rotationOffset:
            settings.rotationOffset !== undefined
              ? settings.rotationOffset
              : existing.rotationOffset,
        };
      } else {
        // Create new canvas settings if not found
        canvasSettings.push({
          id: canvasId,
          trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
          ...settings,
        });
      }
    },

    updateTrailSettings(
      canvasId: string,
      trailSettings: Partial<TrailSettings>
    ) {
      const index = canvasSettings.findIndex((cs) => cs.id === canvasId);
      const existing = canvasSettings[index];
      if (index !== -1 && existing) {
        canvasSettings[index] = {
          ...existing,
          trailSettings: {
            ...existing.trailSettings,
            ...trailSettings,
          },
        };
      }
    },

    // Mobile UI
    setMobileToolView(view: MobileToolView) {
      mobileToolView = view;
      saveToStorage(STORAGE_KEYS.MOBILE_TOOL_VIEW, view);
      debug.log(`Mobile tool view set to ${view}`);
    },

    toggleMobileToolView() {
      const newView = mobileToolView === "controls" ? "step-grid" : "controls";
      mobileToolView = newView;
      saveToStorage(STORAGE_KEYS.MOBILE_TOOL_VIEW, newView);
      debug.log(`Mobile tool view toggled to ${newView}`);
    },

    // Reset
    reset() {
      isPlaying = false;
      speed = 1.0;
      shouldLoop = false;
      currentStep = 0;
      playbackMode = "continuous";
      stepPlaybackPauseMs = 300;
      stepPlaybackStepSize = 1;
      easingType = "linear";
      currentMode = "single";
      sequences = [];
      canvasSettings = [
        {
          id: "main",
          trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
        },
      ];
    },
  };
}

// Singleton instance
let playbackStateInstance: PlaybackState | null = null;

export function getPlaybackState(): PlaybackState {
  if (!playbackStateInstance) {
    playbackStateInstance = createPlaybackState();
  }
  return playbackStateInstance;
}
