// @vitest-environment jsdom
/**
 * Clearing a sequence has to leave a working Undo. The real persister and the
 * real undo manager run together here because the bug lived between them: Clear
 * recorded its entry, then rotating the draft session wiped the whole stack.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import { UserWorkType } from "#lib/shared/persistence/domain/enums/user-work-type.js";
import type { ActiveCreateModule } from "#lib/shared/foundation/ui/ui-types.js";
import {
  SequencePersister,
  type WorkspaceDraftState,
} from "#lib/features/create/shared/services/sequence-persister.js";
import {
  UndoManager,
  UndoOperationType,
} from "#lib/features/create/shared/services/undo-manager.js";

const sequence = (name: string) => createSequenceData({ id: name, name });

const workspace = (
  name: string,
  mode: ActiveCreateModule = "construct"
): WorkspaceDraftState => ({
  currentSequence: sequence(name),
  selectedStartPlacement: null,
  hasStartPlacement: false,
  activeBuildSection: mode,
});

function wired() {
  const manager = new UndoManager();
  const persister = new SequencePersister();
  persister.setHistoryAdapter({
    capture: (mode) => manager.captureDraftHistory(mode),
    restore: (mode, sessionId, history) =>
      manager.restoreDraftHistory(mode, sessionId, history),
    move: (mode, sessionId) => manager.moveDraftHistory(mode, sessionId),
  });
  return { manager, persister };
}

function record(
  manager: UndoManager,
  name: string | null,
  mode: ActiveCreateModule = "construct",
  type = UndoOperationType.ADD_BEAT
) {
  manager.pushUndo(
    type,
    {
      sequence: name ? sequence(name) : null,
      selectedStepNumber: null,
      activeSection: mode,
      timestamp: Date.now(),
    },
    { description: name ?? "empty" },
    manager.getDraftSessionId(mode)
  );
}

// The Clear button records its entry in a microtask, then wipes the saved draft.
async function pressClear(
  manager: UndoManager,
  persister: SequencePersister,
  name: string
) {
  queueMicrotask(() =>
    record(manager, name, "construct", UndoOperationType.CLEAR_SEQUENCE)
  );
  await persister.clearCurrentState("construct");
}

describe("Clear leaves a working Undo", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.userWork.clear();
  });

  it("brings the whole sequence back in one press", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    await persister.saveCurrentState(workspace("my sequence"));

    await pressClear(manager, persister, "my sequence");

    expect(manager.canUndoForSection("construct")).toBe(true);
    const entry = manager.undo("construct");
    expect(entry?.type).toBe(UndoOperationType.CLEAR_SEQUENCE);
    expect(entry?.beforeState.sequence?.name).toBe("my sequence");
  });

  it("keeps Undo when an old autosave left the history without a session", async () => {
    await db.userWork.add({
      type: UserWorkType.SEQUENCE_DRAFT,
      tabId: "create",
      data: {
        sessionId: "old-session",
        sequenceData: workspace("old backup").currentSequence,
      },
      lastModified: new Date(),
      version: 1,
    });
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    expect(manager.getDraftSessionId("construct")).toBeUndefined();
    record(manager, "one step");

    await pressClear(manager, persister, "my sequence");

    expect(manager.getDraftSessionId("construct")).toBe(
      persister.getSessionId("construct")
    );
    expect(manager.undo("construct")?.beforeState.sequence?.name).toBe(
      "my sequence"
    );
    expect(manager.undo("construct")?.beforeState.sequence?.name).toBe(
      "one step"
    );
  });

  it("keeps the earlier steps and the redo stack behind the Clear", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    record(manager, "one step");
    record(manager, "two steps");
    manager.undo("construct");
    expect(manager.canRedoForSection("construct")).toBe(true);

    await persister.clearCurrentState("construct");

    expect(manager.canUndoForSection("construct")).toBe(true);
    expect(manager.canRedoForSection("construct")).toBe(true);
    const sessionId = manager.getDraftSessionId("construct");
    expect(sessionId).toBe(persister.getSessionId("construct"));
    for (const entry of [...manager.undoHistory, ...manager.redoHistory]) {
      expect(entry.sessionId).toBe(sessionId);
    }
  });

  it("lets new work follow the Clear and walks back through it", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    await persister.saveCurrentState(workspace("old work"));
    await pressClear(manager, persister, "old work");

    record(manager, null);

    expect(manager.undoHistory).toHaveLength(2);
    expect(manager.undo("construct")?.beforeState.sequence).toBeNull();
    expect(manager.undo("construct")?.beforeState.sequence?.name).toBe(
      "old work"
    );
  });

  it("still starts a new session, so the old work keeps its Drafts slot", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    await persister.saveCurrentState(workspace("old work"));
    const before = persister.getSessionId("construct");

    await pressClear(manager, persister, "old work");

    expect(persister.getSessionId("construct")).not.toBe(before);
    expect(
      (await persister.listDrafts("construct")).map(
        (draft) => draft.workspace.currentSequence?.name
      )
    ).toContain("old work");
  });

  it("leaves another mode's history alone", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    await persister.loadCurrentState("spell");
    record(manager, "spell work", "spell");
    const spellSession = manager.getDraftSessionId("spell");

    await pressClear(manager, persister, "construct work");

    expect(manager.getDraftSessionId("spell")).toBe(spellSession);
    expect(manager.canUndoForSection("spell")).toBe(true);
  });

  it("keeps Undo when Create loads again without a page reload", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    await persister.saveCurrentState(workspace("my sequence"));
    await pressClear(manager, persister, "my sequence");

    expect(await persister.loadCurrentState("construct")).toBeNull();

    expect(manager.getLastUndoEntry("construct")?.beforeState.sequence?.name).toBe(
      "my sequence"
    );
  });

  it("does not bring cleared work back after a page reload", async () => {
    const first = wired();
    await first.persister.loadCurrentState("construct");
    await first.persister.saveCurrentState(workspace("my sequence"));
    await pressClear(first.manager, first.persister, "my sequence");
    window.dispatchEvent(new Event("pagehide"));

    const reloaded = wired();
    expect(await reloaded.persister.loadCurrentState("construct")).toBeNull();

    expect(reloaded.manager.canUndoForSection("construct")).toBe(false);
  });

  it("still resets history when the Drafts dialog starts fresh or a link opens new work", async () => {
    const { manager, persister } = wired();
    await persister.loadCurrentState("construct");
    record(manager, "old work");

    await persister.startFreshDraft("construct");
    expect(manager.canUndoForSection("construct")).toBe(false);

    record(manager, "other work");
    await persister.beginNewSession("construct");
    expect(manager.canUndoForSection("construct")).toBe(false);
  });
});
