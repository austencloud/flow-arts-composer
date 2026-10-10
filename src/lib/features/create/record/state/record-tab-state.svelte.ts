/**
 * Record Tab State
 *
 * Manages state for the Record tab including playback, beat progression, and metronome.
 * Follows TKA patterns: factory function returning state with getters/setters.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Creates record tab state for practice and recording functionality
 */
export function createRecordTabState(sequenceData: SequenceData | null = null) {

  let isPlaying = $state(false);
  let currentStepIndex = $state(0);
  let bpm = $state(60);
  let isMetronomeEnabled = $state(true);
  let sequence = $state<SequenceData | null>(sequenceData);
  const totalSteps = $derived(sequence?.steps.length || 0);
  const hasSequence = $derived(sequence !== null && totalSteps > 0);
  const isAtEnd = $derived(currentStepIndex >= totalSteps - 1);


  function play() {
    if (!hasSequence) {
      console.warn("Cannot play: no sequence loaded");
      return;
    }
    isPlaying = true;
  }

  function pause() {
    isPlaying = false;
  }

  function togglePlayPause() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function reset() {
    currentStepIndex = 0;
    isPlaying = false;
  }

  function nextStep() {
    if (currentStepIndex < totalSteps - 1) {
      currentStepIndex++;
    } else {
      // Loop back to start or stop
      currentStepIndex = 0;
      isPlaying = false; // Stop at end for now
    }
  }

  function setBpm(newBpm: number) {
    bpm = Math.max(30, Math.min(180, newBpm));
  }

  function setMetronomeEnabled(enabled: boolean) {
    isMetronomeEnabled = enabled;
  }

  function setSequence(newSequence: SequenceData | null) {
    sequence = newSequence;
    reset(); // Reset playback when sequence changes
  }

  function setCurrentStepIndex(index: number) {
    if (index >= 0 && index < totalSteps) {
      currentStepIndex = index;
    }
  }


  return {
    // Readonly state
    get isPlaying() {
      return isPlaying;
    },
    get currentStepIndex() {
      return currentStepIndex;
    },
    get bpm() {
      return bpm;
    },
    get isMetronomeEnabled() {
      return isMetronomeEnabled;
    },
    get sequence() {
      return sequence;
    },
    get totalSteps() {
      return totalSteps;
    },
    get hasSequence() {
      return hasSequence;
    },
    get isAtEnd() {
      return isAtEnd;
    },

    // Actions
    play,
    pause,
    togglePlayPause,
    reset,
    nextStep,
    setBpm,
    setMetronomeEnabled,
    setSequence,
    setCurrentStepIndex,
  };
}
