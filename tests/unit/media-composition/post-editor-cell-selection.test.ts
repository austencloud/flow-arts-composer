import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import {
  setArrangementCellLayers,
  setArrangementGrid,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import { createPostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
import { createBlankArrangementSnapshot } from "#lib/shared/share/components/post-studio/editor/post-editor-arrangement.js";

const sequence = {
  id: "seq-cell-selection",
  displayName: "Cells",
  steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
} as unknown as SequenceData;

const layer: TunnelLayerConfig = {
  sequence,
  beatOffset: 0,
  propColors: { left: "#3b82f6", right: "#ef4444" },
  transformStack: [],
};

function editorWithArrangement() {
  const editor = createPostEditorState({ getSequence: () => sequence });
  const id = editor.addArrangement(createBlankArrangementSnapshot(), 0)!;
  return { editor, id };
}

describe("selecting a cell of an arrangement", () => {
  beforeEach(() => localStorage.clear());

  it("selects a visible cell of the selected arrangement only", () => {
    const { editor } = editorWithArrangement();
    expect(editor.selectedCellId).toBeNull();
    expect(editor.selectCell("cell-0-1")).toBe(true);
    expect(editor.selectedCellId).toBe("cell-0-1");
    expect(editor.selectedCell?.col).toBe(1);
    // Backing cells outside the 2x2 grid are not on screen.
    expect(editor.selectCell("cell-5-5")).toBe(false);
    expect(editor.selectCell("no-such-cell")).toBe(false);
    expect(editor.selectedCellId).toBe("cell-0-1");
    expect(editor.selectCell(null)).toBe(true);
    expect(editor.selectedCellId).toBeNull();
  });

  it("refuses a cell while no arrangement is selected", () => {
    const { editor } = editorWithArrangement();
    editor.selectedItemId = null;
    expect(editor.selectCell("cell-0-0")).toBe(false);
    expect(editor.selectedCellId).toBeNull();
  });

  it("drops the cell when the selection moves to another item", () => {
    const { editor, id } = editorWithArrangement();
    editor.selectCell("cell-0-0");
    const second = editor.addArrangement(createBlankArrangementSnapshot(), 0)!;
    expect(editor.selectedItemId).toBe(second);
    expect(editor.selectedCellId).toBeNull();
    editor.selectedItemId = id;
    expect(editor.selectedCellId).toBeNull();
  });

  it("keeps the cell when the same item is set again", () => {
    const { editor, id } = editorWithArrangement();
    editor.selectCell("cell-0-0");
    editor.selectedItemId = id;
    expect(editor.selectedCellId).toBe("cell-0-0");
  });

  it("drops the cell when a grid change hides it and undo brings it back", () => {
    const { editor, id } = editorWithArrangement();
    editor.selectCell("cell-1-1");
    editor.edit((project, ctx) => setArrangementGrid(project, id, 1, 1, ctx));
    expect(editor.selectedCellId).toBeNull();
    editor.undo();
    expect(editor.selectedCellId).toBe("cell-1-1");
  });

  it("Delete clears the cell's layers and keeps the arrangement", () => {
    const { editor, id } = editorWithArrangement();
    editor.edit((project, ctx) =>
      setArrangementCellLayers(project, id, "cell-0-0", [layer], ctx)
    );
    editor.selectCell("cell-0-0");
    expect(editor.deleteSelected()).toBe(true);
    expect(editor.selectedItemId).toBe(id);
    expect(editor.selectedCell?.layers).toEqual([]);
    editor.undo();
    expect(editor.selectedCell?.layers).toHaveLength(1);
  });

  it("clearSelectedCell is a no-op without a cell", () => {
    const { editor } = editorWithArrangement();
    expect(editor.clearSelectedCell()).toBe(false);
  });
});
