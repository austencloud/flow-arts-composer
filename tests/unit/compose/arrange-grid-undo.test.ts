import { describe, expect, it } from "vitest";
import { arrangeGridState, createArrangeGridState } from "$lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte";

describe("Arrange grid undo", () => {
  it("keeps an isolated Studio grid away from the legacy draft", () => {
    const key = "compose-arrange-grid-v7";
    const original = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify({ cells: [], gridRows: 7, gridCols: 7 }));
    const state = createArrangeGridState({ persist: false });
    expect(state.captureSnapshot()).toMatchObject({ gridRows: 2, gridCols: 2 });
    state.restoreSnapshot({ ...state.captureSnapshot(), gridRows: 3, bpm: 90 });
    expect(localStorage.getItem(key)).toBe(JSON.stringify({ cells: [], gridRows: 7, gridCols: 7 }));
    state.dispose();
    if (original === null) localStorage.removeItem(key);
    else localStorage.setItem(key, original);
  });

  it("restores tempo and skip-start when undoing a loaded arrangement", () => {
    const state = arrangeGridState;
    const before = state.captureSnapshot();
    state.clearUndoHistory();
    state.restoreSnapshot({ ...before, bpm: 96,
      skipStartPlacement: !before.skipStartPlacement });
    expect(state.captureSnapshot()).toMatchObject({ bpm: 96,
      skipStartPlacement: !before.skipStartPlacement });
    state.undo();
    expect(state.captureSnapshot()).toMatchObject({ bpm: before.bpm,
      skipStartPlacement: before.skipStartPlacement });
    state.redo();
    expect(state.captureSnapshot()).toMatchObject({ bpm: 96,
      skipStartPlacement: !before.skipStartPlacement });
    state.restoreSnapshot(before);
    state.clearUndoHistory();
  });

  it("pads a sparse Studio arrangement so empty cells remain editable", () => {
    const state = createArrangeGridState({ persist: false });
    const first = state.captureSnapshot().cells[0]!;
    state.restoreSnapshot({ schemaVersion: 1, cells: [first], gridRows: 2,
      gridCols: 2, bpm: 120, skipStartPlacement: true });
    expect(state.cells).toHaveLength(64);
    expect(state.visibleCells).toHaveLength(4);
    expect(state.cells[1]?.id).toBe("cell-0-1");
    state.dispose();
  });

  it("restores dimensions along with cell spans", () => {
    const state = arrangeGridState;
    state.reset();
    state.clearUndoHistory();
    const originalRows = state.rows;
    const originalCols = state.cols;

    state.setGridDimensions(originalRows + 1, originalCols + 1);
    expect(state.rows).toBe(originalRows + 1);
    expect(state.cols).toBe(originalCols + 1);
    state.undo();
    expect(state.rows).toBe(originalRows);
    expect(state.cols).toBe(originalCols);
    state.redo();
    expect(state.rows).toBe(originalRows + 1);
    expect(state.cols).toBe(originalCols + 1);

    state.reset();
    state.clearUndoHistory();
  });
});
