// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
import { createUndoController } from "$lib/features/create/shared/state/create-module/undo-controller.svelte";
import {
  UndoManager,
  UndoOperationType,
} from "$lib/features/create/shared/services/undo-manager";
import { createSequence as createSequenceData } from "$lib/shared/create/services/sequence-domain-manager";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import type { SequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";

function makeSequence(name: string, length = 2) {
  const sequence = createSequenceData({
    name,
    word: name,
    length,
  });
  const startPlacement = {
    id: `${sequence.id}-start`,
    isStartPlacement: true,
  } as unknown as StartPlacementData;

  return {
    ...sequence,
    startPlacement,
    startingPlacement: startPlacement,
  };
}

function makeSequenceRepository() {
  const createSequence = vi.fn(
    async (request: { name: string; word: string; length: number }) =>
      createSequenceData(request)
  );

  return {
    createSequence,
    service: { createSequence } as unknown as SequenceRepository,
  };
}

function makePersister() {
  const saveCurrentState = vi.fn().mockResolvedValue(undefined);
  const clearCurrentState = vi.fn().mockResolvedValue(undefined);

  return {
    saveCurrentState,
    clearCurrentState,
    service: {
      initialize: vi.fn().mockResolvedValue(undefined),
      loadCurrentState: vi.fn().mockResolvedValue(null),
      saveCurrentState,
      clearCurrentState,
    } as unknown as SequencePersister,
  };
}

describe("Construct tutorial workspace isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("restores the original draft and selection without persisting tutorial edits", async () => {
    const repository = makeSequenceRepository();
    const persister = makePersister();
    const state = createSequenceState({
      sequenceService: repository.service,
      SequencePersister: persister.service,
      tabId: "construct",
    });
    const original = makeSequence("Original draft");

    state.setCurrentSequence(original);
    // Simulate the stale selection cache seen during live HMR/tab handoffs.
    state.setSelectedStartPlacement(null);
    state.selectStep(2);

    expect(state.beginTutorialWorkspace()).toBe(true);
    expect(state.isTutorialWorkspaceIsolated).toBe(true);
    expect(state.currentSequence).toBeNull();
    expect(state.selectedStepNumber).toBeNull();

    const tutorialSequence = await state.createSequence({
      name: "Tutorial sequence",
      length: 0,
    });
    expect(tutorialSequence?.name).toBe("Tutorial sequence");
    expect(repository.createSequence).not.toHaveBeenCalled();

    await state.saveSequenceDataOnly();
    await state.clearPersistedState();

    // The only save is the real draft flush performed before isolation.
    expect(persister.saveCurrentState).toHaveBeenCalledTimes(1);
    expect(
      persister.saveCurrentState.mock.calls[0]?.[0].currentSequence?.id
    ).toBe(original.id);
    expect(persister.saveCurrentState.mock.calls[0]?.[0].hasStartPlacement).toBe(
      true
    );
    expect(persister.clearCurrentState).not.toHaveBeenCalled();

    expect(state.restoreTutorialWorkspace()).toBe(true);
    expect(state.isTutorialWorkspaceIsolated).toBe(false);
    expect(state.currentSequence?.id).toBe(original.id);
    expect(state.currentSequence?.name).toBe("Original draft");
    expect(state.hasStartPlacement).toBe(true);
    expect(state.selectedStepNumber).toBe(2);

    await state.saveSequenceDataOnly();
    expect(persister.saveCurrentState).toHaveBeenCalledTimes(2);
    expect(
      persister.saveCurrentState.mock.calls[1]?.[0].currentSequence?.id
    ).toBe(original.id);
  });

  it("restores a multi-step selection exactly", () => {
    const repository = makeSequenceRepository();
    const state = createSequenceState({
      sequenceService: repository.service,
    });

    state.setCurrentSequence(makeSequence("Batch edit", 3));
    state.applyClickSelection(1, { range: false, toggle: false });
    state.applyClickSelection(3, { range: true, toggle: false });

    expect(state.beginTutorialWorkspace()).toBe(true);
    expect(state.restoreTutorialWorkspace()).toBe(true);

    expect(state.isMultiSelectMode).toBe(true);
    expect(Array.from(state.selectedStepNumbers)).toEqual([1, 2, 3]);
    expect(state.selectionAnchor).toBe(1);
  });

  it("keeps first-run tutorial work in the normal persistence path", async () => {
    const repository = makeSequenceRepository();
    const state = createSequenceState({
      sequenceService: repository.service,
    });
    const staleStartPlacement = {
      id: "stale-start",
      isStartPlacement: true,
    } as unknown as StartPlacementData;

    state.setSelectedStartPlacement(staleStartPlacement);
    state.selectStep(0);

    expect(state.beginTutorialWorkspace()).toBe(false);
    expect(state.isTutorialWorkspaceIsolated).toBe(false);
    expect(state.selectedStartPlacement).toBeNull();
    expect(state.selectedStepNumber).toBeNull();

    const sequence = await state.createSequence({
      name: "First sequence",
      length: 0,
    });

    expect(repository.createSequence).toHaveBeenCalledTimes(1);
    expect(state.restoreTutorialWorkspace()).toBe(false);
    expect(state.currentSequence?.id).toBe(sequence?.id);
  });
});

describe("Construct tutorial undo isolation", () => {
  it("hides and preserves the real undo timeline while suspended", async () => {
    const undoManager = new UndoManager();
    const original = makeSequence("Undo draft");
    const sequenceState = {
      currentSequence: original,
      selectedStepNumber: 1,
    } as unknown as SequenceState;
    const controller = createUndoController({
      UndoManager: undoManager,
      sequenceState,
      getActiveSection: () => "construct",
      setActiveSectionInternal: vi.fn().mockResolvedValue(undefined),
    });

    controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
    await Promise.resolve();
    expect(undoManager.undoHistory).toHaveLength(1);

    controller.suspendHistory();
    expect(controller.canUndo).toBe(false);
    expect(controller.undoHistory).toEqual([]);
    expect(controller.getTimeline()).toEqual([]);

    controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
    controller.clearUndoHistory();
    expect(controller.undo()).toBe(false);
    await Promise.resolve();

    expect(undoManager.undoHistory).toHaveLength(1);

    controller.resumeHistory();
    expect(controller.canUndo).toBe(true);
    expect(controller.undoHistory).toHaveLength(1);

    controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
    await Promise.resolve();
    expect(undoManager.undoHistory).toHaveLength(2);
  });
});
