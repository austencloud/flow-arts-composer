/**
 * Sequence Arrow State
 *
 * Manages arrow positioning state:
 * - Arrow positions map
 * - Positioning in progress flag
 * - Positioning errors
 *
 * RESPONSIBILITY: Pure arrow positioning state, no calculation logic
 */

import type { ArrowPosition } from "#lib/shared/pictograph/arrow/orchestration/domain/arrow-models.js";

export interface SequenceArrowStateData {
  arrowPositions: Map<string, ArrowPosition>;
  arrowPositioningInProgress: boolean;
  arrowPositioningError: string | null;
}

export function createSequenceArrowState() {
  const state = $state<SequenceArrowStateData>({
    arrowPositions: new Map<string, ArrowPosition>(),
    arrowPositioningInProgress: false,
    arrowPositioningError: null,
  });

  return {
    // Getters
    get arrowPositions() {
      return state.arrowPositions;
    },
    get arrowPositioningInProgress() {
      return state.arrowPositioningInProgress;
    },
    get arrowPositioningError() {
      return state.arrowPositioningError;
    },

    // Computed
    get hasArrowPositions() {
      return state.arrowPositions.size > 0;
    },
    get arrowPositioningComplete() {
      return !state.arrowPositioningInProgress && state.arrowPositions.size > 0;
    },

    // Operations
    setArrowPositions(positions: Map<string, ArrowPosition>) {
      state.arrowPositions = positions;
    },

    getArrowPosition(color: string): ArrowPosition | null {
      return state.arrowPositions.get(color) || null;
    },

    clearArrowPositions() {
      state.arrowPositions.clear();
    },

    setPositioningInProgress(inProgress: boolean) {
      state.arrowPositioningInProgress = inProgress;
    },

    setPositioningError(error: string | null) {
      state.arrowPositioningError = error;
    },

    reset() {
      state.arrowPositions.clear();
      state.arrowPositioningInProgress = false;
      state.arrowPositioningError = null;
    },
  };
}

export type SequenceArrowState = ReturnType<typeof createSequenceArrowState>;
