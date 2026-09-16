/**
 * Option History Manager
 *
 * Tracks option selections (beat additions) so we can provide undo-friendly UX.
 * Isolated from the main create module state for clarity and easier testing.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export type OptionSelectionHistoryEntry = {
  stepIndex: number;
  stepData: StepData;
  timestamp: number;
};

type OptionHistoryManagerDeps = {
  getSequence: () => SequenceData | null;
};

const MAX_OPTION_HISTORY = 50;

export function createOptionHistoryManager({
  getSequence,
}: OptionHistoryManagerDeps) {
  const history = $state<OptionSelectionHistoryEntry[]>([]);
  const hasHistory = $derived(history.length > 0);

  function add(stepIndex: number, stepData: StepData) {
    history.push({
      stepIndex,
      stepData,
      timestamp: Date.now(),
    });

    if (history.length > MAX_OPTION_HISTORY) {
      history.shift();
    }
  }

  function pop(): OptionSelectionHistoryEntry | null {
    const lastEntry = history.pop();
    return lastEntry ?? null;
  }

  function clear() {
    history.splice(0, history.length);
  }

  function rebuildFromSequence() {
    const sequence = getSequence();
    history.splice(0, history.length);

    if (!sequence) {
      return;
    }

    // Skip index 0 because it represents the start placement
    const steps = sequence.steps ?? [];
    for (let i = 1; i < steps.length; i++) {
      const beat = steps[i];
      if (!beat) continue;

      history.push({
        stepIndex: i,
        stepData: beat,
        timestamp: Date.now() - (steps.length - i) * 1000,
      });
    }
  }

  return {
    get history() {
      return history;
    },
    get hasHistory() {
      return hasHistory;
    },
    add,
    pop,
    clear,
    rebuildFromSequence,
  };
}

export type OptionHistoryManager = ReturnType<
  typeof createOptionHistoryManager
>;
