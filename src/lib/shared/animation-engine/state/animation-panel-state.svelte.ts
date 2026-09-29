/**
 * Animation Panel State Factory
 *
 * Manages all reactive state for the animation panel using Svelte 5 runes pattern.
 * Provides clean getters/setters following TKA state management conventions.
 * Uses unified persistence utility for localStorage auto-save.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { createPersistenceHelper } from "$lib/shared/state/utils/persistent-state";
import {
  PLAYBACK_MIN_SPEED,
  PLAYBACK_MAX_SPEED,
} from "$lib/shared/animation-engine/domain/constants/timing";


/** Playback mode: continuous animation or step-by-step */
export type PlaybackMode = "continuous" | "step";

/** Step size for step playback mode: half-beat or full beat */
export type StepPlaybackStepSize = 0.5 | 1;


const speedPersistence = createPersistenceHelper({
  key: "tka_animation_speed",
  defaultValue: 1.0,
});

const loopPersistence = createPersistenceHelper({
  key: "tka_animation_loop_state",
  defaultValue: false,
});

const exportLoopCountPersistence = createPersistenceHelper({
  key: "tka_animation_export_loop_count",
  defaultValue: 1,
});

const playbackModePersistence = createPersistenceHelper<PlaybackMode>({
  key: "tka_animation_playback_mode",
  defaultValue: "continuous",
});

const stepPlaybackPauseMsPersistence = createPersistenceHelper<number>({
  key: "tka_animation_step_playback_pause_ms",
  defaultValue: 300,
});

const stepPlaybackStepSizePersistence =
  createPersistenceHelper<StepPlaybackStepSize>({
    key: "tka_animation_step_playback_step_size",
    defaultValue: 1,
  });

/** Keys that can be observed for changes */
export type AnimationStateKey =
  | "isPlaying"
  | "playbackMode"
  | "stepPlaybackPauseMs"
  | "stepPlaybackStepSize"
  | "speed"
  | "currentStep";

/** Observer callback type */
export type AnimationStateObserver = (
  key: AnimationStateKey,
  value: unknown
) => void;

export type AnimationPanelState = {
  // Playback state
  readonly currentStep: number;
  readonly isPlaying: boolean;
  readonly speed: number;
  readonly shouldLoop: boolean;
  readonly playbackMode: PlaybackMode;
  readonly stepPlaybackPauseMs: number;
  readonly stepPlaybackStepSize: StepPlaybackStepSize;

  // Export settings
  readonly exportLoopCount: number;

  // Sequence metadata
  readonly totalSteps: number;
  readonly sequenceWord: string;
  readonly sequenceAuthor: string;

  // Prop rendering states
  readonly leftPropState: PropState;
  readonly rightPropState: PropState;

  // Loading state
  readonly loading: boolean;
  readonly error: string | null;
  readonly sequenceData: SequenceData | null;

  // Video export state
  readonly virtualTime?: number;

  // State mutators
  setCurrentStep: (beat: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setShouldLoop: (loop: boolean) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setStepPlaybackPauseMs: (pauseMs: number) => void;
  setStepPlaybackStepSize: (stepSize: StepPlaybackStepSize) => void;
  setExportLoopCount: (count: number) => void;
  setTotalSteps: (steps: number) => void;
  setSequenceMetadata: (word: string, author: string) => void;
  setLeftPropState: (state: PropState) => void;
  setRightPropState: (state: PropState) => void;
  setPropStates: (left: PropState, right: PropState) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSequenceData: (data: SequenceData | null) => void;
  setVirtualTime: (time: number | undefined) => void;
  reset: () => void;
  /** Cleanup function - call in onDestroy to prevent memory leaks */
  dispose: () => void;

  // Observer pattern for cross-component reactivity
  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe: (observer: AnimationStateObserver) => () => void;
};

const DEFAULT_PROP_STATE: PropState = {
  centerPathAngle: 0,
  staffRotationAngle: 0,
  // x and y are optional - only set for dash motions
};

/**
 * @param options.ephemeral When true, the instance ignores the shared
 *   localStorage prefs (speed/loop/playbackMode/step/exportLoopCount): it starts
 *   from defaults and never auto-saves. Use for scoped surfaces (e.g. the Fuse
 *   animation preview) that must not inherit — or clobber — the user's global
 *   playback settings.
 */
export function createAnimationPanelState(
  options?: { ephemeral?: boolean }
): AnimationPanelState {
  const ephemeral = options?.ephemeral ?? false;

  // Observer set for notifying subscribers
  const observers = new Set<AnimationStateObserver>();

  function notify(key: AnimationStateKey, value: unknown) {
    observers.forEach((observer) => observer(key, value));
  }

  // Playback state. Ephemeral instances start from the same defaults the
  // persistence helpers above declare, but never read or write localStorage.
  let currentStep = $state(0);
  let isPlaying = $state(false);
  let speed = $state(ephemeral ? 1.0 : speedPersistence.load());
  let shouldLoop = $state(ephemeral ? false : loopPersistence.load());
  let playbackMode = $state<PlaybackMode>(
    ephemeral ? "continuous" : playbackModePersistence.load()
  );
  let stepPlaybackPauseMs = $state(
    ephemeral ? 300 : stepPlaybackPauseMsPersistence.load()
  );
  let stepPlaybackStepSize = $state<StepPlaybackStepSize>(
    ephemeral ? 1 : stepPlaybackStepSizePersistence.load()
  );

  // Export settings
  let exportLoopCount = $state(
    ephemeral ? 1 : exportLoopCountPersistence.load()
  );

  // Auto-save speed, loop state, and export loop count.
  // Skipped entirely for ephemeral instances so a scoped surface can't write
  // its fixed values back over the user's global prefs.
  const cleanupEffects = ephemeral
    ? () => {}
    : $effect.root(() => {
        $effect(() => {
          void speed;
          speedPersistence.setupAutoSave(speed);
        });

        $effect(() => {
          void shouldLoop;
          loopPersistence.setupAutoSave(shouldLoop);
        });

        $effect(() => {
          void playbackMode;
          playbackModePersistence.setupAutoSave(playbackMode);
        });

        $effect(() => {
          void stepPlaybackPauseMs;
          stepPlaybackPauseMsPersistence.setupAutoSave(stepPlaybackPauseMs);
        });

        $effect(() => {
          void stepPlaybackStepSize;
          stepPlaybackStepSizePersistence.setupAutoSave(stepPlaybackStepSize);
        });

        $effect(() => {
          void exportLoopCount;
          exportLoopCountPersistence.setupAutoSave(exportLoopCount);
        });
      });

  // Sequence metadata
  let totalSteps = $state(0);
  let sequenceWord = $state("");
  let sequenceAuthor = $state("");

  // Prop states
  let leftPropState = $state<PropState>({ ...DEFAULT_PROP_STATE });
  let rightPropState = $state<PropState>({ ...DEFAULT_PROP_STATE });

  // Loading state
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sequenceData = $state<SequenceData | null>(null);
  let virtualTime = $state<number | undefined>(undefined);

  return {
    // Getters
    get currentStep() {
      return currentStep;
    },
    get isPlaying() {
      return isPlaying;
    },
    get speed() {
      return speed;
    },
    get shouldLoop() {
      return shouldLoop;
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
    get exportLoopCount() {
      return exportLoopCount;
    },
    get totalSteps() {
      return totalSteps;
    },
    get sequenceWord() {
      return sequenceWord;
    },
    get sequenceAuthor() {
      return sequenceAuthor;
    },
    get leftPropState() {
      return leftPropState;
    },
    get rightPropState() {
      return rightPropState;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get sequenceData() {
      return sequenceData;
    },
    get virtualTime() {
      return virtualTime;
    },

    // Setters (with observer notifications for observable keys)
    setCurrentStep: (beat: number) => {
      currentStep = beat;
      notify("currentStep", beat);
    },

    setIsPlaying: (playing: boolean) => {
      isPlaying = playing;
      notify("isPlaying", playing);
    },

    setSpeed: (newSpeed: number) => {
      const clamped = Math.max(PLAYBACK_MIN_SPEED, Math.min(PLAYBACK_MAX_SPEED, newSpeed));
      speed = clamped;
      notify("speed", clamped);
    },

    setShouldLoop: (loop: boolean) => {
      shouldLoop = loop;
    },

    setPlaybackMode: (mode: PlaybackMode) => {
      playbackMode = mode;
      notify("playbackMode", mode);
    },

    setStepPlaybackPauseMs: (pauseMs: number) => {
      const clamped = Math.max(0, Math.min(2000, Math.round(pauseMs)));
      stepPlaybackPauseMs = clamped;
      notify("stepPlaybackPauseMs", clamped);
    },

    setStepPlaybackStepSize: (stepSize: StepPlaybackStepSize) => {
      const value = stepSize === 0.5 ? 0.5 : 1;
      stepPlaybackStepSize = value;
      notify("stepPlaybackStepSize", value);
    },

    setExportLoopCount: (count: number) => {
      exportLoopCount = Math.max(1, Math.min(10, count));
    },

    setTotalSteps: (steps: number) => {
      totalSteps = steps;
    },

    setSequenceMetadata: (word: string, author: string) => {
      sequenceWord = word;
      sequenceAuthor = author;
    },

    setLeftPropState: (state: PropState) => {
      leftPropState = { ...state };
    },

    setRightPropState: (state: PropState) => {
      rightPropState = { ...state };
    },

    setPropStates: (left: PropState, right: PropState) => {
      leftPropState = { ...left };
      rightPropState = { ...right };
    },

    setLoading: (isLoading: boolean) => {
      loading = isLoading;
    },

    setError: (err: string | null) => {
      error = err;
    },

    setSequenceData: (data: SequenceData | null) => {
      sequenceData = data;
    },

    setVirtualTime: (time: number | undefined) => {
      virtualTime = time;
    },

    reset: () => {
      currentStep = 0;
      isPlaying = false;
      speed = 1.0;
      shouldLoop = false;
      playbackMode = "continuous";
      stepPlaybackPauseMs = 300;
      stepPlaybackStepSize = 1;
      exportLoopCount = 1;
      totalSteps = 0;
      sequenceWord = "";
      sequenceAuthor = "";
      leftPropState = { ...DEFAULT_PROP_STATE };
      rightPropState = { ...DEFAULT_PROP_STATE };
      loading = false;
      error = null;
      sequenceData = null;
    },

    dispose: () => {
      cleanupEffects();
      observers.clear();
    },

    subscribe: (observer: AnimationStateObserver) => {
      observers.add(observer);
      return () => observers.delete(observer);
    },
  };
}
