import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneUndoManager } from "../scene-undo-manager";
import type { SceneUndoSnapshot, ViewerDomainSnapshot } from "../scene-undo-types";

function makeViewerSnapshot(overrides: Partial<ViewerDomainSnapshot> = {}): ViewerDomainSnapshot {
  return {
    performers: [{ id: "p0", position: { x: 0, z: 0 }, facingAngle: 0, customLeftPlane: "wall" as any, customRightPlane: "wall" as any }],
    selectedPerformerIndex: null,
    activeFormation: "manual",
    ...overrides,
  };
}

describe("SceneUndoManager", () => {
  let manager: SceneUndoManager;
  let viewerState: ViewerDomainSnapshot;
  let restoreCalls: ViewerDomainSnapshot[];

  beforeEach(() => {
    manager = new SceneUndoManager();
    viewerState = makeViewerSnapshot();
    restoreCalls = [];

    manager.registerDomain("viewer", {
      capture: () => structuredClone(viewerState),
      restore: (snapshot) => {
        viewerState = snapshot;
        restoreCalls.push(snapshot);
      },
    });
  });

  // Basic push/undo/redo

  it("starts with empty stacks", () => {
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
    expect(manager.historySize).toBe(0);
  });

  it("ignores unchanged snapshots without discarding a redo branch", () => {
    manager.captureState("spatial-edit", "Move");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();
    manager.undo();

    manager.captureState("spatial-edit", "No change");
    manager.commitState();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(true);
  });

  it("keeps snapshot history isolated from mutations during restore", () => {
    manager.captureState("spatial-edit", "Move");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();
    manager.undo();
    viewerState.performers[0]!.position.x = 123;
    manager.redo();
    manager.undo();
    expect(viewerState.performers[0]!.position.x).toBe(0);
  });

  it("captures and commits a state change", () => {
    manager.captureState("spawn-performer", "Add performer");

    viewerState = makeViewerSnapshot({
      performers: [...viewerState.performers, { id: "p1", position: { x: 1, z: 0 }, facingAngle: 0, customLeftPlane: "wall" as any, customRightPlane: "wall" as any }],
    });

    manager.commitState();

    expect(manager.canUndo).toBe(true);
    expect(manager.canRedo).toBe(false);
    expect(manager.historySize).toBe(1);
    expect(manager.undoDescription).toBe("Add performer");
  });

  it("undo restores beforeState", () => {
    const before = structuredClone(viewerState);
    manager.captureState("spawn-performer", "Add performer");

    viewerState = makeViewerSnapshot({
      performers: [...viewerState.performers, { id: "p1", position: { x: 1, z: 0 }, facingAngle: 0, customLeftPlane: "wall" as any, customRightPlane: "wall" as any }],
    });

    manager.commitState();

    const result = manager.undo();
    expect(result).not.toBeNull();
    expect(result!.description).toBe("Add performer");
    expect(restoreCalls).toHaveLength(1);
    expect(restoreCalls[0]!.performers).toHaveLength(1);
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(true);
  });

  it("redo restores afterState", () => {
    manager.captureState("spawn-performer", "Add performer");

    viewerState = makeViewerSnapshot({
      performers: [...viewerState.performers, { id: "p1", position: { x: 1, z: 0 }, facingAngle: 0, customLeftPlane: "wall" as any, customRightPlane: "wall" as any }],
    });

    manager.commitState();
    manager.undo();

    const result = manager.redo();
    expect(result).not.toBeNull();
    expect(result!.description).toBe("Add performer");
    expect(restoreCalls).toHaveLength(2);
    expect(restoreCalls[1]!.performers).toHaveLength(2);
    expect(manager.canUndo).toBe(true);
    expect(manager.canRedo).toBe(false);
  });

  it("redo cleared on new push", () => {
    manager.captureState("spawn-performer", "First");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();

    manager.undo();
    expect(manager.canRedo).toBe(true);

    manager.captureState("spawn-performer", "Second");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 2 });
    manager.commitState();

    expect(manager.canRedo).toBe(false);
  });

  // Max history

  it("trims oldest entries when exceeding 100", () => {
    for (let i = 0; i < 105; i++) {
      manager.captureState("spatial-edit", `Edit ${i}`);
      viewerState = makeViewerSnapshot({ selectedPerformerIndex: i });
      manager.commitState();
    }

    expect(manager.historySize).toBe(100);
    expect(manager.undoDescription).toBe("Edit 104");
  });

  // =========================================================================
  // Coalescing
  // =========================================================================

  it("coalesces same-key operations within window", () => {
    manager.captureState("spatial-edit", "Move 1");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitStateCoalescing("spatial", 500);

    expect(manager.historySize).toBe(1);

    manager.captureState("spatial-edit", "Move 2");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 2 });
    manager.commitStateCoalescing("spatial", 500);

    expect(manager.historySize).toBe(1);
    expect(manager.undoDescription).toBe("Move 2");
  });

  it("creates new entry for different coalescing key", () => {
    manager.captureState("spatial-edit", "Move 1");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitStateCoalescing("spatial-A", 500);

    manager.captureState("spatial-edit", "Move 2");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 2 });
    manager.commitStateCoalescing("spatial-B", 500);

    expect(manager.historySize).toBe(2);
  });

  it("creates new entry when coalescing window expires", async () => {
    manager.captureState("spatial-edit", "Move 1");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitStateCoalescing("spatial", 10);

    await new Promise((r) => setTimeout(r, 20));

    manager.captureState("spatial-edit", "Move 2");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 2 });
    manager.commitStateCoalescing("spatial", 10);

    expect(manager.historySize).toBe(2);
  });

  // =========================================================================
  // withoutUndo
  // =========================================================================

  it("withoutUndo suppresses capture/commit", () => {
    manager.withoutUndo(() => {
      manager.captureState("spawn-performer", "Should not record");
      viewerState = makeViewerSnapshot({ selectedPerformerIndex: 99 });
      manager.commitState();
    });

    expect(manager.historySize).toBe(0);
    expect(manager.canUndo).toBe(false);
  });

  it("undo still works during withoutUndo", () => {
    manager.captureState("spawn-performer", "Before");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();

    manager.withoutUndo(() => {
      const result = manager.undo();
      expect(result).not.toBeNull();
    });

    expect(manager.canUndo).toBe(false);
  });

  // =========================================================================
  // cancelPending
  // =========================================================================

  it("cancelPending discards uncommitted capture", () => {
    manager.captureState("spawn-performer", "Will cancel");
    manager.cancelPending();
    manager.commitState();

    expect(manager.historySize).toBe(0);
  });

  // =========================================================================
  // Empty stack
  // =========================================================================

  it("undo on empty stack returns null", () => {
    expect(manager.undo()).toBeNull();
  });

  it("redo on empty stack returns null", () => {
    expect(manager.redo()).toBeNull();
  });

  // =========================================================================
  // Subscribe/unsubscribe
  // =========================================================================

  it("notifies subscribers on commit", () => {
    const fn = vi.fn();
    manager.subscribe(fn);

    manager.captureState("spawn-performer", "Test");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops notifications", () => {
    const fn = vi.fn();
    const unsub = manager.subscribe(fn);
    unsub();

    manager.captureState("spawn-performer", "Test");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();

    expect(fn).not.toHaveBeenCalled();
  });

  it("notifies on undo and redo", () => {
    const fn = vi.fn();
    manager.subscribe(fn);

    manager.captureState("spawn-performer", "Test");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();
    fn.mockClear();

    manager.undo();
    expect(fn).toHaveBeenCalledTimes(1);

    fn.mockClear();
    manager.redo();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // clear
  // =========================================================================

  it("clear empties all stacks", () => {
    manager.captureState("spawn-performer", "Test");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();
    manager.undo();

    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(true);

    manager.clear();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
    expect(manager.historySize).toBe(0);
  });

  // =========================================================================
  // Multi-entry undo/redo cycle
  // =========================================================================

  it("multi-entry: undo reverts in reverse order", () => {
    manager.captureState("spawn-performer", "First");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();

    manager.captureState("spawn-performer", "Second");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 2 });
    manager.commitState();

    manager.captureState("spawn-performer", "Third");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 3 });
    manager.commitState();

    expect(manager.historySize).toBe(3);

    let result = manager.undo();
    expect(result!.description).toBe("Third");

    result = manager.undo();
    expect(result!.description).toBe("Second");

    result = manager.undo();
    expect(result!.description).toBe("First");

    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(true);
  });

  // =========================================================================
  // structuredClone isolation
  // =========================================================================

  it("mutating source after capture does not corrupt snapshot", () => {
    manager.captureState("spatial-edit", "Before mutation");

    const originalX = viewerState.performers[0]!.position.x;
    viewerState.performers[0]!.position.x = 999;

    manager.commitState();

    manager.undo();

    expect(restoreCalls[0]!.performers[0]!.position.x).toBe(originalX);
  });

  // =========================================================================
  // Descriptions
  // =========================================================================

  it("undoDescription and redoDescription reflect stack tops", () => {
    expect(manager.undoDescription).toBeNull();
    expect(manager.redoDescription).toBeNull();

    manager.captureState("spawn-performer", "Alpha");
    viewerState = makeViewerSnapshot({ selectedPerformerIndex: 1 });
    manager.commitState();

    expect(manager.undoDescription).toBe("Alpha");
    expect(manager.redoDescription).toBeNull();

    manager.undo();
    expect(manager.undoDescription).toBeNull();
    expect(manager.redoDescription).toBe("Alpha");
  });
});
