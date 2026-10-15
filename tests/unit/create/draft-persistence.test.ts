import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import { UserWorkType } from "#lib/shared/persistence/domain/enums/user-work-type.js";
import {
  SequencePersister,
  type WorkspaceDraftState,
} from "#lib/features/create/shared/services/sequence-persister.js";

const workspace = (
  name: string,
  mode: WorkspaceDraftState["activeBuildSection"] = "construct"
): WorkspaceDraftState => ({
  currentSequence: createSequenceData({ id: name, name }),
  selectedStartPlacement: null,
  hasStartPlacement: false,
  activeBuildSection: mode,
});

describe("durable Create drafts", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.userWork.clear();
  });

  it("keeps the losing tab’s latest work and refuses a silent overwrite", async () => {
    const first = new SequencePersister();
    await first.saveCurrentState(workspace("initial"));
    const second = new SequencePersister();
    expect(
      (await second.loadCurrentState("construct"))?.currentSequence?.name
    ).toBe("initial");

    await first.saveCurrentState(workspace("first edit"));
    await expect(
      second.saveCurrentState(workspace("second edit"))
    ).rejects.toThrow("Another tab");
    expect(second.getDraftStatus("construct").status).toBe("conflict");
    expect(
      (await second.listDrafts("construct")).map(
        (draft) => draft.workspace.currentSequence?.name
      )
    ).toContain("second edit");
    expect(
      (await new SequencePersister().loadCurrentState("construct"))
        ?.currentSequence?.name
    ).toBe("first edit");

    await expect(
      second.saveCurrentState(workspace("latest second edit"))
    ).rejects.toThrow("Choose a draft version");
    expect(
      (await second.listDrafts("construct")).map(
        (draft) => draft.workspace.currentSequence?.name
      )
    ).toContain("latest second edit");
  });

  it("accepts exactly one of two simultaneous writes from the same revision", async () => {
    const seed = new SequencePersister();
    await seed.saveCurrentState(workspace("seed"));
    const left = new SequencePersister();
    const right = new SequencePersister();
    await Promise.all([
      left.loadCurrentState("construct"),
      right.loadCurrentState("construct"),
    ]);
    const writes = await Promise.allSettled([
      left.saveCurrentState(workspace("left")),
      right.saveCurrentState(workspace("right")),
    ]);
    expect(writes.filter((write) => write.status === "fulfilled")).toHaveLength(
      1
    );
    expect(writes.filter((write) => write.status === "rejected")).toHaveLength(
      1
    );
    const names = (await left.listDrafts("construct")).map(
      (draft) => draft.workspace.currentSequence?.name
    );
    expect(names).toContain("left");
    expect(names).toContain("right");
  });

  it.each(["missing", "corrupt", "expired"])(
    "offers IndexedDB recovery for a %s primary",
    async (damage) => {
      const first = new SequencePersister();
      await first.saveCurrentState(workspace("safe"));
      const key = "tka-construct-sequence-state-v1";
      if (damage === "missing") localStorage.removeItem(key);
      if (damage === "corrupt") localStorage.setItem(key, "{broken");
      if (damage === "expired") {
        const primary = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<
          string,
          unknown
        >;
        localStorage.setItem(
          key,
          JSON.stringify({
            ...primary,
            timestamp: Date.now() - 48 * 60 * 60 * 1000,
          })
        );
      }

      const reloaded = new SequencePersister();
      expect(await reloaded.loadCurrentState("construct")).toBeNull();
      expect(reloaded.getDraftStatus("construct").status).toBe("recovery");
      const [candidate] = reloaded.getDraftStatus("construct").candidates;
      expect(candidate.workspace.currentSequence?.name).toBe("safe");
      expect(
        (await reloaded.recoverDraft("construct", candidate.id))
          ?.currentSequence?.name
      ).toBe("safe");
      expect(
        (await new SequencePersister().loadCurrentState("construct"))
          ?.currentSequence?.name
      ).toBe("safe");
    }
  );

  it("does not resurrect cleared Construct work or clear another mode", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("construct"));
    await persister.saveCurrentState(workspace("spell", "spell"));
    await persister.clearCurrentState("construct");
    expect(
      await new SequencePersister().loadCurrentState("construct")
    ).toBeNull();
    expect(
      (await new SequencePersister().loadCurrentState("spell"))?.currentSequence
        ?.name
    ).toBe("spell");
  });

  it("keeps the replaced draft available across further edits in a new session", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("original"));
    await persister.beginNewSession("construct");
    await persister.saveCurrentState(workspace("new work"));
    await persister.saveCurrentState(workspace("new work edited"));
    expect(
      (await persister.listDrafts("construct")).map(
        (draft) => draft.workspace.currentSequence?.name
      )
    ).toContain("original");
  });

  it("offers the old Autosaver backup only for Construct when no v2 head exists", async () => {
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
    const persister = new SequencePersister();
    expect(await persister.loadCurrentState("construct")).toBeNull();
    expect(
      persister.getDraftStatus("construct").candidates[0].workspace
        .currentSequence?.name
    ).toBe("old backup");
    expect(await persister.loadCurrentState("generate")).toBeNull();
    expect(persister.getDraftStatus("generate").candidates).toEqual([]);
    await persister.clearCurrentState("construct");
    expect(
      (await persister.listDrafts("construct")).some((draft) =>
        draft.id.startsWith("legacy-create")
      )
    ).toBe(false);
  });

  it("retries the latest pending edit after a primary write fails", async () => {
    const persister = new SequencePersister();
    const original = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (key === "tka-construct-sequence-state-v1")
          throw new Error("storage unavailable");
        return original.call(this, key, value);
      });
    try {
      await expect(
        persister.saveCurrentState(workspace("older"))
      ).rejects.toThrow();
      await expect(
        persister.saveCurrentState(workspace("latest"))
      ).rejects.toThrow();
      expect(persister.getDraftStatus("construct").status).toBe("error");
    } finally {
      spy.mockRestore();
    }
    await persister.retrySave("construct");
    expect(persister.getDraftStatus("construct").status).toBe("saved");
    expect(
      (await new SequencePersister().loadCurrentState("construct"))
        ?.currentSequence?.name
    ).toBe("latest");
  });

  it("restores history only with an accepted primary or selected recovery version", async () => {
    const first = new SequencePersister();
    const restore = vi.fn();
    first.setHistoryAdapter({
      capture: () => ({ undo: [{ id: "undo-1" }] as never, redo: [] }),
      restore,
    });
    await first.saveCurrentState(workspace("with history"));
    const reloaded = new SequencePersister();
    reloaded.setHistoryAdapter({
      capture: () => ({ undo: [], redo: [] }),
      restore,
    });
    await reloaded.loadCurrentState("construct");
    expect(restore).toHaveBeenCalledWith("construct", expect.any(String), {
      undo: [{ id: "undo-1" }],
      redo: [],
    });
    restore.mockClear();
    localStorage.removeItem("tka-construct-sequence-state-v1");
    const recovery = new SequencePersister();
    recovery.setHistoryAdapter({
      capture: () => ({ undo: [], redo: [] }),
      restore,
    });
    await recovery.loadCurrentState("construct");
    expect(restore).not.toHaveBeenCalled();
    await recovery.recoverDraft(
      "construct",
      recovery.getDraftStatus("construct").candidates[0].id
    );
    expect(restore).toHaveBeenCalledWith("construct", expect.any(String), {
      undo: [{ id: "undo-1" }],
      redo: [],
    });
  });

  it("lets a conflicted editor choose its latest version and keep its history across reload", async () => {
    const first = new SequencePersister();
    await first.saveCurrentState(workspace("seed"));
    const second = new SequencePersister();
    await second.loadCurrentState("construct");
    const sharedSession = second.getSessionId("construct");
    second.setHistoryAdapter({
      capture: () => ({ undo: [{ id: "second-undo" }] as never, redo: [] }),
      restore: vi.fn(),
    });
    await first.saveCurrentState(workspace("first edit"));
    await expect(
      second.saveCurrentState(workspace("second edit"))
    ).rejects.toThrow();
    await expect(
      second.saveCurrentState(workspace("latest second edit"))
    ).rejects.toThrow();
    const chosen = (await second.listDrafts("construct")).find(
      (draft) => draft.workspace.currentSequence?.name === "latest second edit"
    );
    expect(chosen).toBeDefined();
    expect(
      (await second.recoverDraft("construct", chosen!.id))?.currentSequence
        ?.name
    ).toBe("latest second edit");
    expect(second.getSessionId("construct")).toBe(sharedSession);
    const restore = vi.fn();
    const reloaded = new SequencePersister();
    reloaded.setHistoryAdapter({
      capture: () => ({ undo: [], redo: [] }),
      restore,
    });
    expect(
      (await reloaded.loadCurrentState("construct"))?.currentSequence?.name
    ).toBe("latest second edit");
    expect(reloaded.getSessionId("construct")).toBe(sharedSession);
    expect(restore).toHaveBeenCalledWith("construct", sharedSession, {
      undo: [{ id: "second-undo" }],
      redo: [],
    });
  });

  it("keeps a failed recovery choice retryable until the primary copy accepts it", async () => {
    const first = new SequencePersister();
    await first.saveCurrentState(workspace("saved version"));
    localStorage.removeItem("tka-construct-sequence-state-v1");
    const recovery = new SequencePersister();
    const restore = vi.fn();
    recovery.setHistoryAdapter({
      capture: () => ({ undo: [], redo: [] }),
      restore,
    });
    await recovery.loadCurrentState("construct");
    const id = recovery.getDraftStatus("construct").candidates[0].id;
    const original = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (key === "tka-construct-sequence-state-v1")
          throw new Error("primary failed");
        return original.call(this, key, value);
      });
    try {
      expect(await recovery.recoverDraft("construct", id)).toBeNull();
      expect(recovery.getDraftStatus("construct").status).toBe("error");
      expect(
        recovery
          .getDraftStatus("construct")
          .candidates.some((draft) => draft.id === id)
      ).toBe(true);
      expect(restore).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(
      (await recovery.recoverDraft("construct", id))?.currentSequence?.name
    ).toBe("saved version");
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("resets history on a new session and archives work cleared from the head", async () => {
    const persister = new SequencePersister();
    const restore = vi.fn();
    persister.setHistoryAdapter({
      capture: () => ({ undo: [], redo: [] }),
      restore,
    });
    await persister.saveCurrentState(workspace("old work"));
    await persister.beginNewSession("construct");
    expect(restore).toHaveBeenLastCalledWith(
      "construct",
      persister.getSessionId("construct")
    );
    await persister.startFreshDraft("construct");
    expect(restore).toHaveBeenLastCalledWith(
      "construct",
      persister.getSessionId("construct")
    );
    expect(
      (await persister.listDrafts("construct")).map(
        (draft) => draft.workspace.currentSequence?.name
      )
    ).toContain("old work");
    expect(
      await new SequencePersister().loadCurrentState("construct")
    ).toBeNull();
  });

  it("skips damaged version rows while listing valid alternatives", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("valid"));
    await db.userWork.add({
      type: UserWorkType.SEQUENCE_DRAFT,
      tabId: "create-draft-v2:construct:conflict:damaged",
      data: { kind: "version", version: { id: "bad", mode: "construct" } },
      lastModified: new Date(),
      version: 2,
    });
    expect(
      (await persister.listDrafts("construct")).map(
        (draft) => draft.workspace.currentSequence?.name
      )
    ).toContain("valid");
  });

  it("lists a version once when archive and predecessor hold the same save", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("original"));
    await persister.beginNewSession("construct");
    await persister.saveCurrentState(workspace("replacement"));
    const ids = (await persister.listDrafts("construct")).map(
      (draft) => draft.id
    );
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("starts a fresh mode with its own empty history session", async () => {
    const persister = new SequencePersister();
    const restore = vi.fn();
    persister.setHistoryAdapter({
      capture: () => ({ undo: [], redo: [] }),
      restore,
    });
    expect(await persister.loadCurrentState("spell")).toBeNull();
    expect(restore).toHaveBeenCalledWith(
      "spell",
      persister.getSessionId("spell")
    );
  });
});
