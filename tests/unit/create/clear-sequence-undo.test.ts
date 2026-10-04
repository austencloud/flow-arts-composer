import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";

const mocks = vi.hoisted(() => ({
  startHistoryTransition: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: {
    info: mocks.toastInfo,
  },
}));

import {
  UndoManager,
  UndoOperationType,
} from "$lib/features/create/shared/services/undo-manager";
import { createUndoController } from "$lib/features/create/shared/state/create-module/undo-controller.svelte";

function sequenceFixture(): SequenceData {
  return {
    id: "sequence-before-clear",
    name: "Sequence before clear",
    steps: [
      {
        id: "step-1",
        stepNumber: 1,
      },
      {
        id: "step-2",
        stepNumber: 2,
      },
    ],
  } as SequenceData;
}

function sequenceStateHarness(initialSequence: SequenceData | null) {
  let currentSequence: SequenceData | null = initialSequence;
  let selectedStepNumber: number | null = 2;

  const state = {
    get currentSequence() {
      return currentSequence;
    },
    get selectedStepNumber() {
      return selectedStepNumber;
    },
    setCurrentSequence(sequence: SequenceData | null) {
      currentSequence = sequence;
    },
    selectStep(stepNumber: number) {
      selectedStepNumber = stepNumber;
    },
    clearSelection() {
      selectedStepNumber = null;
    },
    clearSequenceCompletely: vi.fn(),
    animationState: {
      startHistoryTransition: mocks.startHistoryTransition,
    },
  } as unknown as SequenceState;

  return {
    state,
    clear() {
      currentSequence = null;
      selectedStepNumber = null;
    },
    replace(sequence: SequenceData, selection: number | null) {
      currentSequence = sequence;
      selectedStepNumber = selection;
    },
  };
}

describe("cleared sequence undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      }
    );
  });

  it("restores the complete pre-clear sequence and picker state in one undo", async () => {
    const originalSequence = sequenceFixture();
    const harness = sequenceStateHarness(originalSequence);
    const undoManager = new UndoManager();
    const syncPickerState = vi.fn();
    const controller = createUndoController({
      UndoManager: undoManager,
      sequenceState: harness.state,
      getActiveSection: () => "construct",
      setActiveSectionInternal: vi.fn(),
    });
    controller.setSyncPickerStateCallback(syncPickerState);

    controller.pushUndoSnapshot(UndoOperationType.CLEAR_SEQUENCE, {
      description: "Clear sequence",
    });
    await Promise.resolve();
    harness.clear();

    expect(controller.nextUndoEntry?.type).toBe(
      UndoOperationType.CLEAR_SEQUENCE
    );
    expect(controller.undo()).toBe(true);
    expect(harness.state.currentSequence).toEqual(originalSequence);
    expect(harness.state.currentSequence).not.toBe(originalSequence);
    expect(harness.state.currentSequence?.steps).not.toBe(
      originalSequence.steps
    );
    expect(harness.state.selectedStepNumber).toBe(2);
    expect(syncPickerState).toHaveBeenCalledOnce();
    expect(mocks.startHistoryTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "undo",
        operation: UndoOperationType.CLEAR_SEQUENCE,
        insertedStepIdentities: new Set(["step:step-1", "step:step-2"]),
      })
    );
  });

  it("finds the next undo for Construct even when another tab changed later", () => {
    const undoManager = new UndoManager();
    const sequence = sequenceFixture();

    undoManager.pushUndo(
      UndoOperationType.CLEAR_SEQUENCE,
      {
        sequence,
        selectedStepNumber: 2,
        activeSection: "construct",
        timestamp: 1,
      },
      { description: "Clear sequence" }
    );
    undoManager.pushUndo(
      UndoOperationType.GENERATE_SEQUENCE,
      {
        sequence,
        selectedStepNumber: null,
        activeSection: "generate",
        timestamp: 2,
      },
      { description: "Generate sequence" }
    );

    expect(undoManager.getLastUndoEntry("construct")?.type).toBe(
      UndoOperationType.CLEAR_SEQUENCE
    );
    expect(undoManager.getLastUndoEntry("generate")?.type).toBe(
      UndoOperationType.GENERATE_SEQUENCE
    );
  });

  it("captures the edited state during undo and restores it during redo", async () => {
    const originalSequence = sequenceFixture();
    const editedSequence = {
      ...sequenceFixture(),
      name: "Sequence after edit",
      steps: [...sequenceFixture().steps, { id: "step-3", stepNumber: 3 }],
    } as SequenceData;
    const harness = sequenceStateHarness(originalSequence);
    const undoManager = new UndoManager();
    const syncPickerState = vi.fn();
    const controller = createUndoController({
      UndoManager: undoManager,
      sequenceState: harness.state,
      getActiveSection: () => "construct",
      setActiveSectionInternal: vi.fn(),
    });
    controller.setSyncPickerStateCallback(syncPickerState);

    controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT, {
      description: "Add step 3",
    });
    await Promise.resolve();
    harness.replace(editedSequence, 3);

    expect(controller.undo()).toBe(true);
    expect(controller.canRedo).toBe(true);
    expect(controller.nextRedoEntry?.metadata?.description).toBe("Add step 3");
    expect(harness.state.currentSequence).toEqual(originalSequence);

    expect(controller.redo()).toBe(true);
    expect(harness.state.currentSequence).toEqual(editedSequence);
    expect(harness.state.currentSequence).not.toBe(editedSequence);
    expect(harness.state.currentSequence?.steps).not.toBe(editedSequence.steps);
    expect(harness.state.selectedStepNumber).toBe(3);
    expect(controller.canRedo).toBe(false);
    expect(syncPickerState).toHaveBeenCalledTimes(2);
    expect(mocks.toastInfo).toHaveBeenLastCalledWith("Redid Add step 3", 1500);
    expect(mocks.startHistoryTransition).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        direction: "undo",
        removedStepIdentities: new Set(["step:step-3"]),
      })
    );
    expect(mocks.startHistoryTransition).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        direction: "redo",
        insertedStepIdentities: new Set(["step:step-3"]),
      })
    );
  });

  it.each([
    UndoOperationType.GENERATE_SEQUENCE,
    UndoOperationType.SPELL_GENERATE,
  ])(
    "restores a blank Generate workspace after %s and redoes the generated sequence",
    async (operation) => {
      const harness = sequenceStateHarness(null);
      const controller = createUndoController({
        UndoManager: new UndoManager(),
        sequenceState: harness.state,
        getActiveSection: () => "generate",
        setActiveSectionInternal: vi.fn(),
      });
      const generated = sequenceFixture();

      controller.pushUndoSnapshot(operation);
      await Promise.resolve();
      harness.replace(generated, 1);

      expect(controller.canUndo).toBe(true);
      expect(controller.undo()).toBe(true);
      expect(harness.state.currentSequence).toBeNull();
      expect(controller.redo()).toBe(true);
      expect(harness.state.currentSequence).toEqual(generated);
    }
  );

  it("keeps the pre-transform snapshot until an async edit commits", () => {
    const original = sequenceFixture();
    const harness = sequenceStateHarness(original);
    const controller = createUndoController({
      UndoManager: new UndoManager(),
      sequenceState: harness.state,
      getActiveSection: () => "construct",
      setActiveSectionInternal: vi.fn(),
    });
    const commit = controller.beginUndoSnapshot(
      UndoOperationType.MIRROR_SEQUENCE
    );
    const transformed = { ...original, name: "Mirrored" };
    harness.replace(transformed, 1);

    expect(controller.canUndo).toBe(false);
    commit();
    commit();
    expect(controller.undoHistory).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(harness.state.currentSequence).toEqual(original);
  });

  it("keeps redo entries isolated to the tab that produced them", () => {
    const undoManager = new UndoManager();
    const sequence = sequenceFixture();
    const constructAfter = {
      sequence: { ...sequence, name: "Construct after" },
      selectedStepNumber: 2,
      activeSection: "construct" as const,
      timestamp: 3,
    };
    const generateAfter = {
      sequence: { ...sequence, name: "Generate after" },
      selectedStepNumber: null,
      activeSection: "generate" as const,
      timestamp: 4,
    };

    undoManager.pushUndo(UndoOperationType.CLEAR_SEQUENCE, {
      sequence,
      selectedStepNumber: 2,
      activeSection: "construct",
      timestamp: 1,
    });
    undoManager.pushUndo(UndoOperationType.GENERATE_SEQUENCE, {
      sequence,
      selectedStepNumber: null,
      activeSection: "generate",
      timestamp: 2,
    });

    undoManager.undo("construct", constructAfter);
    undoManager.undo("generate", generateAfter);

    expect(undoManager.canRedoForSection("construct")).toBe(true);
    expect(undoManager.canRedoForSection("generate")).toBe(true);
    expect(undoManager.peekRedoState("generate")).toEqual(generateAfter);

    undoManager.pushUndo(UndoOperationType.UPDATE_BEAT, {
      sequence: generateAfter.sequence,
      selectedStepNumber: null,
      activeSection: "generate",
      timestamp: 5,
    });

    expect(undoManager.canRedoForSection("construct")).toBe(true);
    expect(undoManager.canRedoForSection("generate")).toBe(false);
    expect(undoManager.redo("construct")?.type).toBe(
      UndoOperationType.CLEAR_SEQUENCE
    );
    expect(undoManager.canRedoForSection("construct")).toBe(false);
  });

  it("does not offer persisted redo entries that predate after-state capture", () => {
    const originalSequence = sequenceFixture();
    const harness = sequenceStateHarness(originalSequence);
    const undoManager = new UndoManager();
    const controller = createUndoController({
      UndoManager: undoManager,
      sequenceState: harness.state,
      getActiveSection: () => "construct",
      setActiveSectionInternal: vi.fn(),
    });

    undoManager.pushUndo(UndoOperationType.ADD_BEAT, {
      sequence: originalSequence,
      selectedStepNumber: 2,
      activeSection: "construct",
      timestamp: 1,
    });
    undoManager.undo("construct");

    expect(controller.canRedo).toBe(false);
    expect(controller.nextRedoEntry).toBeNull();
    expect(controller.redo()).toBe(false);
  });
});
