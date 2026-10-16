import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSequenceState } from "#lib/features/create/shared/state/sequence-state-orchestrator.svelte.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequencePersister } from "#lib/features/create/shared/services/sequence-persister.js";

function makeState() {
  const saveCurrentState = vi.fn().mockResolvedValue(undefined);
  const markDirty = vi.fn();
  const state = createSequenceState({
    SequencePersister: {
      initialize: vi.fn().mockResolvedValue(undefined),
      loadCurrentState: vi.fn().mockResolvedValue(null),
      saveCurrentState,
      markDirty,
    } as unknown as SequencePersister,
    tabId: "construct",
  });
  return { state, saveCurrentState, markDirty };
}

describe("Create draft workspace state", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("restores a recovered workspace without dirtying or autosaving it", async () => {
    const { state, saveCurrentState, markDirty } = makeState();
    state.setCurrentSequence(createSequenceData({ id: "unrecovered-edit" }));
    state.restoreDraftState({
      currentSequence: createSequenceData({ id: "recovered-draft" }),
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: "construct",
    });

    expect(state.currentSequence?.id).toBe("recovered-draft");
    markDirty.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(markDirty).not.toHaveBeenCalled();
    expect(saveCurrentState).not.toHaveBeenCalled();
  });

  it("marks edits dirty immediately and flushes only the latest pending edit", async () => {
    const { state, saveCurrentState, markDirty } = makeState();
    state.setCurrentSequence(createSequenceData({ id: "first-edit" }));
    expect(markDirty).toHaveBeenCalledWith("construct");
    state.setCurrentSequence(createSequenceData({ id: "latest-edit" }));
    await state.saveCurrentState("construct");
    await vi.advanceTimersByTimeAsync(500);

    expect(saveCurrentState).toHaveBeenCalledTimes(1);
    expect(saveCurrentState.mock.calls[0]?.[0].currentSequence?.id).toBe(
      "latest-edit"
    );
  });
});
