/**
 * Sequence Selection State
 *
 * Manages selection state for:
 * - Single-select mode: One beat at a time (default)
 * - Multi-select mode: Multiple steps for batch editing
 * - Selected beat NUMBER (0 = start placement, 1 = first beat, 2 = second beat, etc.)
 * - Selected start placement
 * - Start placement editing mode
 *
 * RESPONSIBILITY: Pure selection tracking, no business logic
 *
 * NOTE: Uses stepNumber instead of array index
 * - stepNumber 0 = start placement
 * - stepNumber 1 = steps[0] (first beat in array)
 * - stepNumber 2 = steps[1] (second beat in array)
 */

import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createPersistenceHelper } from "$lib/shared/state/utils/persistent-state";

export type SelectionMode = "single" | "multi";

// Persist the single-select step number. The step editor + inspect modal hang
// off this, so restoring it across a dev HMR / page refresh lets them reopen on
// the right step instead of empty.
const selectionPersistence = createPersistenceHelper<number | null>({
  key: "tka_selected_step_number",
  defaultValue: null,
});

// Persist the multi-select set + mode too, so an HMR / refresh restores a batch
// selection (the highlighted beats + open batch editor) instead of silently
// dropping back to single-select.
interface PersistedMultiSelection {
  mode: SelectionMode;
  stepNumbers: number[];
  anchor: number | null;
}
const multiSelectPersistence = createPersistenceHelper<PersistedMultiSelection>(
  {
    key: "tka_multi_selection",
    defaultValue: { mode: "single", stepNumbers: [], anchor: null },
  }
);

export interface SequenceSelectionStateData {
  // Mode
  mode: SelectionMode; // 'single' (default) or 'multi' (batch editing)

  // Single-select (backward compatible)
  selectedStepNumber: number | null; // 0 = start, 1 = first beat, 2 = second beat, etc.

  // Multi-select (batch editing)
  selectedStepNumbers: Set<number>; // Multiple beat numbers for batch operations

  // Anchor for shift-range selection (transient — the last plain/toggle click)
  selectionAnchor: number | null;

  // Start placement
  selectedStartPlacement: StartPlacementData | null;
  hasStartPlacement: boolean;
}

export interface SequenceSelectionSnapshot {
  mode: SelectionMode;
  selectedStepNumber: number | null;
  selectedStepNumbers: number[];
  selectionAnchor: number | null;
  selectedStartPlacement: StartPlacementData | null;
}

export function createSequenceSelectionState() {
  // Restore a persisted multi-selection (needs 2+ beats to count as multi).
  const persistedMulti = multiSelectPersistence.load();
  const restoredMulti =
    persistedMulti.mode === "multi" && persistedMulti.stepNumbers.length > 1;

  const state = $state<SequenceSelectionStateData>({
    mode: restoredMulti ? "multi" : "single",
    selectedStepNumber: restoredMulti ? null : selectionPersistence.load(),
    selectedStepNumbers: new Set<number>(
      restoredMulti ? persistedMulti.stepNumbers : []
    ),
    selectionAnchor: persistedMulti.anchor,
    selectedStartPlacement: null,
    hasStartPlacement: false,
  });

  // Auto-save selection so HMR / refresh restores it — both the single-select
  // step number and the multi-select set + mode + anchor.
  $effect.root(() => {
    $effect(() => {
      void state.selectedStepNumber;
      selectionPersistence.setupAutoSave(state.selectedStepNumber);
    });
    $effect(() => {
      // Reading the Set reference tracks it — applyClickSelection always
      // replaces it with a new Set, so this re-runs on every selection change.
      void state.mode;
      void state.selectedStepNumbers;
      void state.selectionAnchor;
      multiSelectPersistence.setupAutoSave({
        mode: state.mode,
        stepNumbers: Array.from(state.selectedStepNumbers),
        anchor: state.selectionAnchor,
      });
    });
  });

  return {
    // Getters
    get selectedStepNumber() {
      return state.selectedStepNumber;
    },

    // Legacy getter for backwards compatibility (can be removed after full refactor)
    get selectedStepIndex() {
      // Convert stepNumber to array index: stepNumber 1 -> index 0, stepNumber 2 -> index 1, etc.
      if (state.selectedStepNumber === null || state.selectedStepNumber === 0) {
        return null;
      }
      return state.selectedStepNumber - 1;
    },

    get selectedStartPlacement() {
      return state.selectedStartPlacement;
    },
    get hasStartPlacement() {
      return state.hasStartPlacement;
    },
    get isStartPlacementSelected() {
      return state.selectedStepNumber === 0;
    },

    // Mode getters
    get mode() {
      return state.mode;
    },
    get isMultiSelectMode() {
      return state.mode === "multi";
    },
    get isSingleSelectMode() {
      return state.mode === "single";
    },

    // Multi-select getters
    get selectedStepNumbers() {
      return state.selectedStepNumbers;
    },
    get selectionAnchor() {
      return state.selectionAnchor;
    },
    get selectionCount(): number {
      if (state.mode === "single") {
        return state.selectedStepNumber !== null ? 1 : 0;
      }
      return state.selectedStepNumbers.size;
    },
    get hasMultipleSelection(): boolean {
      return state.mode === "multi" && state.selectedStepNumbers.size > 1;
    },

    // Computed
    get hasSelection() {
      if (state.mode === "single") {
        return state.selectedStepNumber !== null;
      }
      return state.selectedStepNumbers.size > 0;
    },

    // Selection operations
    selectStep(stepNumber: number | null) {
      state.selectedStepNumber = stepNumber;
      if (stepNumber !== null) state.selectionAnchor = stepNumber;
    },

    /**
     * Front door for a workspace beat click. Routes single-select, shift-range,
     * and ctrl/cmd-toggle in one place so the start-placement guard and the
     * multi-vs-single transitions stay centralized.
     *
     * - shift (range): select the contiguous span from the anchor to `target`.
     * - toggle (ctrl/cmd): add/remove `target`, carrying the current single beat
     *   into the multi set on the first toggle.
     * - neither: plain single-select.
     * The start placement (0) never participates in multi-select.
     */
    applyClickSelection(
      target: number,
      modifiers: { range: boolean; toggle: boolean }
    ) {
      const toSingle = (n: number) => {
        state.mode = "single";
        state.selectedStepNumbers = new Set<number>();
        state.selectedStepNumber = n;
        state.selectionAnchor = n;
      };

      // Start placement: always single, never mixed with beats.
      if (target === 0) {
        toSingle(0);
        return;
      }

      if (modifiers.range) {
        const anchor = state.selectionAnchor;
        if (anchor === null || anchor < 1) {
          toSingle(target);
          return;
        }
        const lo = Math.min(anchor, target);
        const hi = Math.max(anchor, target);
        if (hi - lo < 1) {
          toSingle(target);
          return;
        }
        const set = new Set<number>();
        for (let n = lo; n <= hi; n++) set.add(n);
        state.mode = "multi";
        state.selectedStepNumbers = set;
        state.selectedStepNumber = null;
        // Keep the anchor so the range can be re-extended from the same origin.
        return;
      }

      if (modifiers.toggle) {
        // First toggle from single-select carries the current beat into the set.
        if (state.mode !== "multi") {
          const carry = state.selectedStepNumber;
          state.selectedStepNumbers =
            carry !== null && carry > 0
              ? new Set<number>([carry])
              : new Set<number>();
          state.mode = "multi";
          state.selectedStepNumber = null;
        }
        const set = new Set(state.selectedStepNumbers);
        if (set.has(target)) set.delete(target);
        else set.add(target);
        state.selectionAnchor = target;

        // Collapse a 0/1-element selection back to single-select.
        if (set.size <= 1) {
          const only = set.values().next().value;
          if (only === undefined) {
            state.mode = "single";
            state.selectedStepNumbers = new Set<number>();
            state.selectedStepNumber = null;
          } else {
            toSingle(only);
          }
          return;
        }
        state.selectedStepNumbers = set;
        state.selectedStepNumber = null;
        return;
      }

      // Plain click.
      toSingle(target);
    },

    selectStartPlacement() {
      state.selectedStepNumber = 0;
    },

    clearSelection() {
      state.selectedStepNumber = null;
    },

    isStepSelected(stepNumber: number): boolean {
      if (state.mode === "single") {
        return state.selectedStepNumber === stepNumber;
      }
      return state.selectedStepNumbers.has(stepNumber);
    },

    // Multi-select operations
    enterMultiSelectMode(initialStepNumber: number) {
      state.mode = "multi";
      state.selectedStepNumbers = new Set([initialStepNumber]);
      state.selectedStepNumber = null; // Clear single-select
    },

    exitMultiSelectMode() {
      state.mode = "single";
      state.selectedStepNumbers = new Set<number>(); // Create new Set to trigger reactivity
      state.selectedStepNumber = null;
    },

    toggleStepInMultiSelect(stepNumber: number): {
      success: boolean;
      error?: string;
    } {
      if (state.mode !== "multi") {
        return { success: false, error: "Not in multi-select mode" };
      }

      // Validate: Cannot mix start placement (0) with regular steps (>0)
      const hasStartPlacement = state.selectedStepNumbers.has(0);
      const hasRegularBeats = Array.from(state.selectedStepNumbers).some(
        (n) => n > 0
      );
      const isStartPlacement = stepNumber === 0;

      if (isStartPlacement && hasRegularBeats) {
        return {
          success: false,
          error:
            "Cannot select start placement with steps. They have different properties.",
        };
      }

      if (!isStartPlacement && hasStartPlacement) {
        return {
          success: false,
          error:
            "Cannot select steps with start placement. They have different properties.",
        };
      }

      // Toggle selection - Create new Set to trigger Svelte 5 reactivity
      const newSet = new Set(state.selectedStepNumbers);
      if (newSet.has(stepNumber)) {
        newSet.delete(stepNumber);
      } else {
        newSet.add(stepNumber);
      }
      state.selectedStepNumbers = newSet;

      return { success: true };
    },

    selectAllSteps(stepNumbers: number[]) {
      if (state.mode !== "multi") {
        state.mode = "multi";
      }

      // Filter out start placement if regular steps are included, and vice versa
      const hasStartPlacement = stepNumbers.includes(0);
      const regularSteps = stepNumbers.filter((n) => n > 0);

      if (hasStartPlacement && regularSteps.length > 0) {
        // If both types, prefer regular steps (more common use case)
        state.selectedStepNumbers = new Set(regularSteps);
      } else {
        state.selectedStepNumbers = new Set(stepNumbers);
      }
    },

    clearMultiSelection() {
      state.selectedStepNumbers.clear();
    },

    // Start placement management
    setStartPlacement(startPlacement: StartPlacementData | null) {
      state.selectedStartPlacement = startPlacement;
      state.hasStartPlacement = startPlacement !== null;
    },

    captureSnapshot(): SequenceSelectionSnapshot {
      return {
        mode: state.mode,
        selectedStepNumber: state.selectedStepNumber,
        selectedStepNumbers: Array.from(state.selectedStepNumbers),
        selectionAnchor: state.selectionAnchor,
        selectedStartPlacement: state.selectedStartPlacement,
      };
    },

    restoreSnapshot(snapshot: SequenceSelectionSnapshot): void {
      state.mode = snapshot.mode;
      state.selectedStepNumber = snapshot.selectedStepNumber;
      state.selectedStepNumbers = new Set(snapshot.selectedStepNumbers);
      state.selectionAnchor = snapshot.selectionAnchor;
      state.selectedStartPlacement = snapshot.selectedStartPlacement;
      state.hasStartPlacement = snapshot.selectedStartPlacement !== null;
    },

    // Helpers for beat removal adjustments
    adjustSelectionForRemovedStep(removedStepNumber: number) {
      if (state.selectedStepNumber === removedStepNumber) {
        state.selectedStepNumber = null;
      } else if (
        state.selectedStepNumber !== null &&
        state.selectedStepNumber > removedStepNumber
      ) {
        state.selectedStepNumber = state.selectedStepNumber - 1;
      }
    },

    adjustSelectionForInsertedStep(insertedStepNumber: number) {
      if (
        state.selectedStepNumber !== null &&
        state.selectedStepNumber >= insertedStepNumber
      ) {
        state.selectedStepNumber = state.selectedStepNumber + 1;
      }
    },

    reset() {
      state.mode = "single";
      state.selectedStepNumber = null;
      state.selectedStepNumbers.clear();
      state.selectionAnchor = null;
      state.selectedStartPlacement = null;
      state.hasStartPlacement = false;
    },
  };
}

export type SequenceSelectionState = ReturnType<
  typeof createSequenceSelectionState
>;
