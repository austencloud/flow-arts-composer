import { afterEach, describe, expect, it, vi } from "vitest";
import { createCreateModuleState } from "$lib/features/create/shared/state/create-module-state.svelte";
import { UndoOperationType } from "$lib/features/create/shared/services/undo-manager";
import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";

describe("Create history routing", () => {
  afterEach(() => {
    navigationState.setActiveTab("construct");
  });

  it("records an async Construct edit on its source tab after navigating to Generate", () => {
    const state = createCreateModuleState({} as SequenceRepository);
    const constructSequenceState = {};
    const generateSequenceState = {};
    const constructPush = vi.fn();
    const generatePush = vi.fn();
    state.constructorTabState = {
      sequenceState: constructSequenceState,
      undoController: { pushUndoSnapshot: constructPush },
    } as unknown as NonNullable<typeof state.constructorTabState>;
    state.generatorTabState = {
      sequenceState: generateSequenceState,
      undoController: { pushUndoSnapshot: generatePush },
    } as unknown as NonNullable<typeof state.generatorTabState>;

    navigationState.setActiveTab("construct");
    const sourceState = state.getActiveTabSequenceState();
    navigationState.setActiveTab("generate");
    state.pushUndoSnapshotForSequenceState(
      UndoOperationType.ADD_BEAT,
      sourceState,
      { description: "Add bridge" }
    );

    expect(constructPush).toHaveBeenCalledWith(UndoOperationType.ADD_BEAT, {
      description: "Add bridge",
    });
    expect(generatePush).not.toHaveBeenCalled();
  });

  it("records an async Generate edit on its source tab after navigating to Construct", () => {
    const state = createCreateModuleState({} as SequenceRepository);
    const constructSequenceState = {};
    const generateSequenceState = {};
    const constructPush = vi.fn();
    const generatePush = vi.fn();
    state.constructorTabState = {
      sequenceState: constructSequenceState,
      undoController: { pushUndoSnapshot: constructPush },
    } as unknown as NonNullable<typeof state.constructorTabState>;
    state.generatorTabState = {
      sequenceState: generateSequenceState,
      undoController: { pushUndoSnapshot: generatePush },
    } as unknown as NonNullable<typeof state.generatorTabState>;

    navigationState.setActiveTab("generate");
    const sourceState = state.getActiveTabSequenceState();
    navigationState.setActiveTab("construct");
    state.pushUndoSnapshotForSequenceState(
      UndoOperationType.GENERATE_SEQUENCE,
      sourceState,
      { description: "Generate sequence" }
    );

    expect(generatePush).toHaveBeenCalledWith(
      UndoOperationType.GENERATE_SEQUENCE,
      { description: "Generate sequence" }
    );
    expect(constructPush).not.toHaveBeenCalled();
  });

  it("commits a delayed transform to the initiating Construct controller", () => {
    const state = createCreateModuleState({} as SequenceRepository);
    const constructSequenceState = {};
    const generateSequenceState = {};
    const constructCommit = vi.fn();
    const constructBegin = vi.fn(() => constructCommit);
    const generateBegin = vi.fn(() => vi.fn());
    state.constructorTabState = {
      sequenceState: constructSequenceState,
      undoController: { beginUndoSnapshot: constructBegin },
    } as unknown as NonNullable<typeof state.constructorTabState>;
    state.generatorTabState = {
      sequenceState: generateSequenceState,
      undoController: { beginUndoSnapshot: generateBegin },
    } as unknown as NonNullable<typeof state.generatorTabState>;

    navigationState.setActiveTab("construct");
    const sourceState = state.getActiveTabSequenceState();
    const commit = state.beginUndoSnapshotForSequenceState(
      UndoOperationType.MIRROR_SEQUENCE,
      sourceState
    );
    navigationState.setActiveTab("generate");
    commit();

    expect(constructBegin).toHaveBeenCalledWith(
      UndoOperationType.MIRROR_SEQUENCE,
      undefined
    );
    expect(constructCommit).toHaveBeenCalledOnce();
    expect(generateBegin).not.toHaveBeenCalled();
  });
});
