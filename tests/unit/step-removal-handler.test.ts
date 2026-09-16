/**
 * Regression tests for step removal semantics.
 *
 * Bug (feedback XrKRFOzs3XdgwEluhkRZ, 2026-08-10): the clear-everything
 * special case keyed on the GLOBALLY SELECTED step instead of the index the
 * caller passed. Deleting step N while the start position happened to be
 * selected wiped the entire sequence. The special case is now keyed on the
 * passed index alone (negative index = start position = clear all).
 */

import { describe, expect, it, vi } from "vitest";
import { removeStep } from "../../src/lib/features/create/shared/services/step-operations/step-removal-handler";
import { UndoOperationType } from "../../src/lib/features/create/shared/services/undo-manager";
import type { ICreateModuleState } from "../../src/lib/features/create/shared/types/create-module-types";

function makeState(overrides?: {
  selectedStepNumber?: number | null;
  stepCount?: number;
}) {
  const stepCount = overrides?.stepCount ?? 3;
  const selectedStepNumber = overrides?.selectedStepNumber ?? null;

  const state = {
    pushUndoSnapshot: vi.fn(),
    setActiveToolPanel: vi.fn(),
    sequenceState: {
      selectedStepData:
        selectedStepNumber === null ? null : { stepNumber: selectedStepNumber },
      currentSequence: {
        steps: Array.from({ length: stepCount }, (_, i) => ({ id: `s${i}` })),
      },
      clearSequenceCompletely: vi.fn().mockResolvedValue(undefined),
      removeStepAndSubsequentWithAnimation: vi.fn(),
      selectStep: vi.fn(),
      selectStartPlacementForEditing: vi.fn(),
    },
  };

  return state as unknown as ICreateModuleState & typeof state;
}

describe("removeStep", () => {
  it("clears the entire sequence for a negative index (start position)", () => {
    const state = makeState();

    removeStep(-1, state);

    expect(state.pushUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.CLEAR_SEQUENCE,
      expect.anything()
    );
    expect(state.sequenceState.clearSequenceCompletely).toHaveBeenCalled();
    expect(state.setActiveToolPanel).toHaveBeenCalledWith("construct");
    expect(
      state.sequenceState.removeStepAndSubsequentWithAnimation
    ).not.toHaveBeenCalled();
  });

  it("removes the passed step even while the start position is selected", () => {
    // The regression: selection on the start position (stepNumber 0) used to
    // hijack ANY removal into a whole-sequence wipe.
    const state = makeState({ selectedStepNumber: 0 });

    removeStep(2, state);

    expect(state.sequenceState.clearSequenceCompletely).not.toHaveBeenCalled();
    expect(state.pushUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.REMOVE_BEATS,
      expect.objectContaining({ stepIndex: 2 })
    );
    expect(
      state.sequenceState.removeStepAndSubsequentWithAnimation
    ).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("removes a step normally when a regular step is selected", () => {
    const state = makeState({ selectedStepNumber: 2 });

    removeStep(1, state);

    expect(state.sequenceState.clearSequenceCompletely).not.toHaveBeenCalled();
    expect(
      state.sequenceState.removeStepAndSubsequentWithAnimation
    ).toHaveBeenCalledWith(1, expect.any(Function));
  });
});
