/**
 * Playback State
 *
 * Manages animation playback timing using requestAnimationFrame.
 * Pure playback logic with no knowledge of what's being animated.
 * Persists settings to localStorage for survival across refreshes.
 */

import { browser } from "$app/env";

const DEFAULT_STORAGE_KEY = "tka-3d-playback-state";

interface PersistedPlaybackState {
  isPlaying: boolean;
  speed: number;
  loop: boolean;
}

function loadPersistedState(storageKey: string): PersistedPlaybackState | null {
  if (!browser) return null;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function persistState(storageKey: string, state: PersistedPlaybackState): void {
  if (!browser) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore persistence errors
  }
}

export interface PlaybackOptions {
  /** Called when progress completes a cycle (reaches 1) */
  onCycleComplete?: () => boolean; // Return true to continue playing, false to pause
  /** Custom localStorage key for per-avatar persistence */
  persistenceKey?: string;
}

export function createPlaybackState(options: PlaybackOptions = {}) {
  const storageKey = options.persistenceKey ?? DEFAULT_STORAGE_KEY;

  const persisted = loadPersistedState(storageKey);

  let isPlaying = $state(persisted?.isPlaying ?? false);
  let progress = $state(0);
  let speed = $state(persisted?.speed ?? 1); // Units per second
  let loop = $state(persisted?.loop ?? true);

  let animationFrameId: number | null = null;
  let lastTimestamp: number = 0;

  // Persist state manually (called on meaningful changes)
  function saveState() {
    persistState(storageKey, { isPlaying, speed, loop });
  }

  // Auto-start if persisted state was playing (called after mount)
  // Note: This must call play() directly because loadSequence() calls reset() -> pause()
  // which sets isPlaying to false before this runs
  function autoStartIfNeeded() {
    if (persisted?.isPlaying) {
      setTimeout(() => {
        play();
      }, 100);
    }
  }

  /**
   * Animation loop - updates progress based on elapsed time
   */
  function animate(timestamp: number) {
    if (!isPlaying) return;

    if (lastTimestamp === 0) {
      lastTimestamp = timestamp;
    }

    const deltaMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Update progress (speed = units per second)
    const deltaProgress = (deltaMs / 1000) * speed;
    let newProgress = progress + deltaProgress;

    if (newProgress >= 1) {
      // Check if there's a cycle complete handler
      if (options.onCycleComplete) {
        progress = 0; // Reset progress first
        const shouldContinue = options.onCycleComplete();
        if (!shouldContinue) {
          isPlaying = false;
          // Don't schedule another frame - we're stopping
          return;
        }
        newProgress = newProgress % 1;
      } else if (loop) {
        newProgress = newProgress % 1;
      } else {
        newProgress = 1;
        isPlaying = false;
      }
    }

    progress = newProgress;
    animationFrameId = requestAnimationFrame(animate);
  }

  function play() {
    if (isPlaying) return;
    isPlaying = true;
    lastTimestamp = 0;
    animationFrameId = requestAnimationFrame(animate);
    saveState();
  }

  function pause() {
    isPlaying = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    saveState();
  }

  function togglePlay() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function reset() {
    pause();
    progress = 0;
  }

  function setProgress(value: number) {
    progress = Math.max(0, Math.min(1, value));
  }

  function destroy() {
    pause();
  }

  return {
    get isPlaying() {
      return isPlaying;
    },
    get progress() {
      return progress;
    },
    get speed() {
      return speed;
    },
    set speed(value: number) {
      speed = value;
      saveState();
    },
    get loop() {
      return loop;
    },
    set loop(value: boolean) {
      loop = value;
      saveState();
    },

    play,
    pause,
    togglePlay,
    reset,
    setProgress,
    destroy,
    autoStartIfNeeded,
  };
}

export type PlaybackState = ReturnType<typeof createPlaybackState>;
