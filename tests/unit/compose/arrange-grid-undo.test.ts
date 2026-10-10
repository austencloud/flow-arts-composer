import { describe, expect, it } from "vitest";
import { arrangeGridState } from "#lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.js";

describe("Arrange grid undo", () => {
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
