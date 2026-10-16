// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

const { UndoManager, UndoOperationType } =
  await import("#lib/features/create/shared/services/undo-manager.js");

function snapshot(
  mode: "construct" | "generate",
  name: string,
  timestamp: number
) {
  return {
    sequence: {
      id: `${mode}-${name}`,
      name,
      word: "A",
      steps: [],
      thumbnails: [],
    },
    selectedStepNumber: null,
    activeSection: mode,
    timestamp,
  };
}

function entry(
  mode: "construct" | "generate",
  name: string,
  sessionId?: string
) {
  return {
    id: `${mode}-${name}`,
    type: UndoOperationType.UPDATE_BEAT,
    timestamp: 1,
    beforeState: snapshot(mode, name, 1),
    afterState: snapshot(mode, `${name}-after`, 2),
    ...(sessionId ? { sessionId } : {}),
  };
}

describe("draft-scoped Create undo history", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("restores only the selected draft and preserves another mode's undo and redo", () => {
    const manager = new UndoManager();
    manager.restoreDraftHistory("generate", "generate-session", {
      undo: [entry("generate", "old", "generate-session")],
      redo: [entry("generate", "future", "generate-session")],
    });
    manager.restoreDraftHistory("construct", "construct-session", {
      undo: [entry("construct", "before")],
      redo: [entry("construct", "future")],
    });

    expect(
      manager.captureDraftHistory("generate").undo.map((item) => item.id)
    ).toEqual(["generate-old"]);
    expect(
      manager.captureDraftHistory("generate").redo.map((item) => item.id)
    ).toEqual(["generate-future"]);
    expect(manager.undo("construct")?.beforeState.sequence?.name).toBe(
      "before"
    );
    expect(manager.peekRedoState("construct")?.sequence?.name).toBe(
      "before-after"
    );
    expect(manager.redo("construct")?.id).toBe("construct-before");
    expect(
      manager.captureDraftHistory("generate").undo.map((item) => item.id)
    ).toEqual(["generate-old"]);
  });

  it("rejects foreign, damaged, and stale-session entries during recovery", () => {
    const manager = new UndoManager();
    manager.restoreDraftHistory("construct", "new-session", {
      undo: [
        entry("construct", "valid"),
        entry("generate", "foreign"),
        entry("construct", "old", "old-session"),
        {
          ...entry("construct", "bad-after"),
          afterState: snapshot("generate", "wrong", 3),
        },
        {
          ...entry("construct", "bad-sequence"),
          beforeState: { ...snapshot("construct", "bad", 1), sequence: {} },
        },
      ] as never,
      redo: [entry("construct", "valid-redo")],
    });

    expect(
      manager.captureDraftHistory("construct").undo.map((item) => item.id)
    ).toEqual(["construct-valid"]);
    expect(
      manager.captureDraftHistory("construct").redo.map((item) => item.id)
    ).toEqual(["construct-valid-redo"]);
    expect(manager.captureDraftHistory("construct").undo[0]?.sessionId).toBe(
      "new-session"
    );
  });

  it("drops a queued commit from the prior draft session", () => {
    const manager = new UndoManager();
    const beforeFirstRestore = manager.getDraftSessionId("construct");
    manager.restoreDraftHistory("construct", "old-session");
    manager.pushUndo(
      UndoOperationType.ADD_BEAT,
      snapshot("construct", "before-load", 0),
      undefined,
      beforeFirstRestore
    );
    const capturedSession = manager.getDraftSessionId("construct");
    const beforeState = snapshot("construct", "pending", 1);

    manager.restoreDraftHistory("construct", "new-session", {
      undo: [entry("construct", "recovered", "new-session")],
      redo: [],
    });
    manager.pushUndo(
      UndoOperationType.ADD_BEAT,
      beforeState,
      undefined,
      capturedSession
    );

    expect(
      manager.captureDraftHistory("construct").undo.map((item) => item.id)
    ).toEqual(["construct-recovered"]);
  });

  it("keeps only the newest 50 recovered actions", () => {
    const manager = new UndoManager();
    manager.restoreDraftHistory("construct", "bounded-session", {
      undo: Array.from({ length: 55 }, (_, index) =>
        entry("construct", String(index))
      ),
      redo: [],
    });

    const undo = manager.captureDraftHistory("construct").undo;
    expect(undo).toHaveLength(50);
    expect(undo[0]?.id).toBe("construct-5");
    expect(manager.getLastUndoEntry("construct")?.id).toBe("construct-54");
  });

  it("keeps shared localStorage history from replacing recovered history", async () => {
    const manager = new UndoManager();
    manager.restoreDraftHistory("construct", "current-session", {
      undo: [entry("construct", "current", "current-session")],
      redo: [],
    });
    localStorage.setItem(
      "tka_build_undo_history",
      JSON.stringify([entry("construct", "other-tab", "other-session")])
    );

    await manager.loadHistory();
    await manager.saveHistory();

    expect(
      manager.captureDraftHistory("construct").undo.map((item) => item.id)
    ).toEqual(["construct-current"]);
    expect(
      JSON.parse(localStorage.getItem("tka_build_undo_history") ?? "[]")
    ).toEqual([]);
  });
});
