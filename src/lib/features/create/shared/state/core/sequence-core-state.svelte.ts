/**
 * Sequence Core State
 *
 * Manages the fundamental sequence state:
 * - Current sequence being edited
 * - List of all sequences
 * - Loading/error states
 * - Grid mode
 *
 * RESPONSIBILITY: Pure state management, no business logic or side effects
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { normalizeSequenceDerived } from "$lib/shared/create/services/sequence-derived-fields";

export interface SequenceCoreStateData {
  currentSequence: SequenceData | null;
  currentSequenceRevision: number;
  sequences: SequenceData[];
  isLoading: boolean;
  error: string | null;
  gridMode: GridMode;
  selectedSequenceId: string | null;
}

let nextCurrentSequenceRevision = 0;

function claimCurrentSequenceRevision(): number {
  nextCurrentSequenceRevision += 1;
  return nextCurrentSequenceRevision;
}

export function createSequenceCoreState(
  onCurrentSequenceChange?: (sequence: SequenceData | null) => void
) {
  const state = $state<SequenceCoreStateData>({
    currentSequence: null,
    currentSequenceRevision: 0,
    sequences: [],
    isLoading: false,
    error: null,
    gridMode: GridMode.DIAMOND,
    selectedSequenceId: null,
  });

  // 🐛 FIX: Use $derived to create a stable reference that only updates when
  // state.currentSequence or state.gridMode actually change.
  // Previously, the getter created a new object on every access, causing infinite loops
  // in $effects that depended on currentSequence.
  const currentSequenceWithGridMode = $derived.by(() => {
    if (state.currentSequence) {
      return {
        ...state.currentSequence,
        gridMode: state.gridMode,
      };
    }
    return state.currentSequence;
  });

  return {
    // Getters
    get currentSequence() {
      return currentSequenceWithGridMode;
    },
    get currentSequenceRevision() {
      return state.currentSequenceRevision;
    },
    get sequences() {
      return state.sequences;
    },
    get isLoading() {
      return state.isLoading;
    },
    get error() {
      return state.error;
    },
    get gridMode() {
      return state.gridMode;
    },
    get selectedSequenceId() {
      return state.selectedSequenceId;
    },
    /** Direct read from raw state - bypasses the spread-derived getter to avoid
     *  potential Svelte 5 proxy ownKeys issues with optional fields. */
    get orientationCycleCount(): 1 | 2 | 4 | 8 {
      return state.currentSequence?.orientationCycleCount ?? 1;
    },

    // Computed
    get hasSequence() {
      return state.currentSequence !== null;
    },
    get sequenceCount() {
      return state.sequences.length;
    },

    // Setters
    setCurrentSequence(sequence: SequenceData | null) {
      // Derived fields (gridMode, start/end placements) are recomputed from the
      // motions here so stale stored copies from single-hand edits self-heal.
      const reconciled = sequence
        ? normalizeSequenceDerived(sequence)
        : sequence;
      state.currentSequence = reconciled;
      state.currentSequenceRevision = claimCurrentSequenceRevision();
      state.selectedSequenceId = reconciled?.id ?? null;
      // Derive gridMode from the reconciled sequence — never trust the stored value.
      if (reconciled?.gridMode !== undefined) {
        state.gridMode = reconciled.gridMode;
      }
      onCurrentSequenceChange?.(reconciled);
    },

    setSequences(sequences: SequenceData[]) {
      state.sequences = sequences;
    },

    addSequence(sequence: SequenceData) {
      state.sequences.push(sequence);
    },

    updateSequence(updatedSequence: SequenceData) {
      const index = state.sequences.findIndex(
        (s) => s.id === updatedSequence.id
      );
      if (index >= 0) {
        state.sequences[index] = updatedSequence;
      }
      if (state.currentSequence?.id === updatedSequence.id) {
        state.currentSequence = updatedSequence;
        state.currentSequenceRevision = claimCurrentSequenceRevision();
        onCurrentSequenceChange?.(updatedSequence);
      }
    },

    removeSequence(sequenceId: string) {
      state.sequences = state.sequences.filter((s) => s.id !== sequenceId);
      if (state.currentSequence?.id === sequenceId) {
        state.currentSequence = null;
        state.currentSequenceRevision = claimCurrentSequenceRevision();
        state.selectedSequenceId = null;
        onCurrentSequenceChange?.(null);
      }
    },

    setLoading(loading: boolean) {
      state.isLoading = loading;
    },

    setError(error: string | null) {
      state.error = error;
    },

    clearError() {
      state.error = null;
    },

    setGridMode(mode: GridMode) {
      if (state.gridMode !== mode) {
        state.currentSequenceRevision = claimCurrentSequenceRevision();
      }
      state.gridMode = mode;
    },

    reset() {
      state.currentSequence = null;
      state.currentSequenceRevision = claimCurrentSequenceRevision();
      state.sequences = [];
      state.isLoading = false;
      state.error = null;
      state.gridMode = GridMode.DIAMOND;
      state.selectedSequenceId = null;
      onCurrentSequenceChange?.(null);
    },
  };
}

export type SequenceCoreState = ReturnType<typeof createSequenceCoreState>;
