import { describe, expect, it, vi } from "vitest";
import { createDraftRecoveryController } from "#lib/features/create/shared/state/create-module/draft-recovery-controller.svelte.js";
import type {
  DraftStatus,
  SequencePersister,
} from "#lib/features/create/shared/services/sequence-persister.js";
import type { SequenceState } from "#lib/features/create/shared/state/sequence-state-orchestrator.svelte.js";

function setup(initial: DraftStatus["status"] = "recovery") {
  let status: DraftStatus = {
    status: initial,
    sessionId: "draft",
    savedAt: null,
    error: null,
    candidates: [],
  };
  const listeners: ((s: DraftStatus) => void)[] = [];
  const state = {
    currentSequence: null,
    selectedStartPlacement: null,
    hasStartPlacement: false,
    restoreDraftState: vi.fn(),
    cancelPendingSave: vi.fn(),
    saveCurrentState: vi.fn().mockResolvedValue(undefined),
  };
  const persister = {
    subscribeDraftStatus: vi.fn((_mode, listener) => {
      listeners.push(listener);
      listener(status);
      return vi.fn();
    }),
    getDraftStatus: vi.fn(() => status),
    listDrafts: vi.fn().mockResolvedValue([]),
    hasUncommittedEditorChanges: vi.fn(() => false),
    preserveEditorSnapshot: vi.fn().mockResolvedValue(true),
    recoverDraft: vi.fn().mockResolvedValue(null),
    startFreshDraft: vi.fn().mockResolvedValue(null),
  };
  const onRestored = vi.fn();
  const controller = createDraftRecoveryController({
    persister: persister as unknown as SequencePersister,
    getActiveMode: () => "construct",
    getSequenceState: () => state as unknown as SequenceState,
    onRestored,
  });
  return {
    controller,
    persister,
    state,
    onRestored,
    update(next: DraftStatus["status"]) {
      status = { ...status, status: next };
      listeners.forEach((listener) => listener(status));
    },
  };
}

describe("draft recovery choices", () => {
  it("keeps the existing editor and dialog when recovery fails", async () => {
    const { controller, state } = setup();
    await controller.showDrafts();
    await controller.recover("missing");
    expect(state.cancelPendingSave).toHaveBeenCalled();
    expect(state.restoreDraftState).not.toHaveBeenCalled();
    expect(controller.open).toBe(true);
    expect(controller.message).toBeTruthy();
  });

  it("applies only an accepted draft before closing the choice", async () => {
    const { controller, state, persister, onRestored } = setup();
    const workspace = {
      currentSequence: null,
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: "construct",
    };
    persister.recoverDraft.mockResolvedValue(workspace as never);
    await controller.showDrafts();
    await controller.recover("accepted");
    expect(state.restoreDraftState).toHaveBeenCalledWith(workspace);
    expect(onRestored).toHaveBeenCalledWith("construct");
    expect(controller.open).toBe(false);
  });

  it("never clears the editor when starting fresh fails", async () => {
    const { controller, state, update } = setup();
    await controller.showDrafts();
    update("error");
    await controller.startFresh();
    expect(state.restoreDraftState).not.toHaveBeenCalled();
    expect(controller.open).toBe(true);
  });

  it("retries by capturing the current editor instead of replaying a stale snapshot", async () => {
    const { controller, state } = setup("error");
    await controller.retry();
    expect(state.saveCurrentState).toHaveBeenCalledWith("construct");
  });

  it("preserves the latest editor state before applying a choice after conflict", async () => {
    const { controller, state, persister } = setup("conflict");
    persister.hasUncommittedEditorChanges.mockReturnValue(true);
    const liveSequence = { id: "newest", name: "newest", steps: [] };
    state.currentSequence = liveSequence as never;
    const chosen = {
      currentSequence: null,
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: "construct",
    };
    persister.recoverDraft.mockResolvedValue(chosen as never);
    await controller.showDrafts();
    persister.preserveEditorSnapshot.mockClear();
    await controller.recover("chosen-id");
    expect(persister.preserveEditorSnapshot).toHaveBeenCalledWith(
      {
        currentSequence: liveSequence,
        selectedStartPlacement: null,
        hasStartPlacement: false,
        activeBuildSection: "construct",
      },
      "chosen-id"
    );
    expect(
      persister.preserveEditorSnapshot.mock.invocationCallOrder[0]
    ).toBeLessThan(state.cancelPendingSave.mock.invocationCallOrder[0]);
    expect(
      persister.preserveEditorSnapshot.mock.invocationCallOrder[0]
    ).toBeLessThan(persister.recoverDraft.mock.invocationCallOrder[0]);
  });

  it("blocks recovery and starting fresh when the live editor cannot be preserved", async () => {
    const { controller, state, persister } = setup("error");
    persister.hasUncommittedEditorChanges.mockReturnValue(true);
    await controller.showDrafts();
    persister.preserveEditorSnapshot.mockRejectedValue(
      new Error("disk failed")
    );
    state.cancelPendingSave.mockClear();
    await controller.recover("saved-id");
    expect(persister.recoverDraft).not.toHaveBeenCalled();
    expect(state.cancelPendingSave).not.toHaveBeenCalled();
    expect(controller.open).toBe(true);
    await controller.startFresh();
    expect(persister.startFreshDraft).not.toHaveBeenCalled();
    expect(state.restoreDraftState).not.toHaveBeenCalled();
  });

  it("warns and attempts preservation when conflict edits are still pending", () => {
    const { controller, persister } = setup("conflict");
    persister.hasUncommittedEditorChanges.mockImplementation(
      (mode) => mode === "construct"
    );
    expect(controller.hasUnsavedChanges).toBe(true);
    controller.flushPending();
    expect(persister.preserveEditorSnapshot).toHaveBeenCalledWith({
      currentSequence: null,
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: "construct",
    });
  });
});
