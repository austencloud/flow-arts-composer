/**
 * Sequence Cache Service Implementation
 *
 * Manages cache lifecycle when sequences change or playback stops.
 *
 * Uses reactive state ownership - service owns $state, component derives from it.
 * Clear operations are signaled via incrementing counters that trigger $effect.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
export interface SequenceCacheState {
  sequenceId: string | null;
  clearSignal: number;
  preRenderClearSignal: number;
}

export class SequenceCache {
  // Reactive state - owned by service
  state = $state<SequenceCacheState>({
    sequenceId: null,
    clearSignal: 0,
    preRenderClearSignal: 0,
  });

  private hasPreRenderedFrames = false;

  setHasPreRenderedFrames(value: boolean): void {
    this.hasPreRenderedFrames = value;
  }

  handleSequenceChange(sequenceData: SequenceData | null): string | null {
    if (!sequenceData) {
      // No sequence - signal clear
      this.state.clearSignal++;
      this.state.sequenceId = null;
      return null;
    }

    // Generate unique sequence ID
    const word = sequenceData.word || sequenceData.name || "unknown";
    const totalSteps = sequenceData.steps?.length || 0;
    const newSequenceId = `${word}-${totalSteps}`;

    // If sequence changed, signal clear
    if (
      this.state.sequenceId !== null &&
      this.state.sequenceId !== newSequenceId
    ) {
      this.state.clearSignal++;
    }

    const changed = this.state.sequenceId !== newSequenceId;
    this.state.sequenceId = newSequenceId;
    return changed ? newSequenceId : null;
  }

  handlePlaybackChange(isPlaying: boolean): void {
    if (!isPlaying && this.hasPreRenderedFrames) {
      this.state.preRenderClearSignal++;
      this.hasPreRenderedFrames = false;
    }
  }

  dispose(): void {
    this.state.sequenceId = null;
    this.state.clearSignal = 0;
    this.state.preRenderClearSignal = 0;
    this.hasPreRenderedFrames = false;
  }
}
