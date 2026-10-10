import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { GridCell } from "#lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.js";
import {
  buildCellContextMenuItems,
  type CellContextMenuCallbacks,
} from "#lib/features/compose/tabs/arrange/components/grid/cell-editor/context-menu/cell-context-menu-builder.js";

describe("composition cell context menu save action", () => {
  it("names the saved artifact when the cell displays a sequence", () => {
    const sequence = {
      id: "visible-sequence",
      steps: [{ letter: "A" }],
    } as unknown as SequenceData;
    const cell = {
      layers: [{ sequence }],
    } as unknown as GridCell;

    const items = buildCellContextMenuItems(
      cell,
      {} as CellContextMenuCallbacks
    );

    expect(items[0]).toMatchObject({
      id: "save-to-library",
      label: "Save sequence to Library",
    });
    expect(items[1]).toEqual({ type: "separator" });
  });
});
