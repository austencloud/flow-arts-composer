import { describe, expect, it } from "vitest";
import { gridCellsToComposition, compositionToGridState } from "$lib/features/compose/tabs/arrange/services/arrange-composition-converter";
import { validateArrangementSnapshot } from "$lib/shared/media-composition/domain/arrangement";
import type { GridCell } from "$lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte";

function cells(): GridCell[] {
  return Array.from({ length: 64 }, (_, index) => ({
    id: `cell-${Math.floor(index / 8)}-${index % 8}`,
    row: Math.floor(index / 8), col: index % 8, layers: [],
    beatOffset: 0, colSpan: 1, rowSpan: 1, mediaType: "animation",
  }));
}

describe("Arrange composition persistence", () => {
  it("retains the complete editable arrangement through save and load", () => {
    const original = cells();
    original[0] = { ...original[0]!, layers: [{
      sequence: { id: "one", steps: [], createdAt: new Date("2026-01-01"),
        optionalMetadata: undefined } as never,
      beatOffset: 3, propColors: { left: "#123456", right: "#abcdef" },
      transformStack: [{ type: "rotate90", hand: "both", timestamp: 1 }],
    }, {
      sequence: { id: "two", steps: [] } as never,
      beatOffset: -2, propColors: { left: "#654321", right: "#fedcba" },
      transformStack: [],
    }], beatOffset: 2, colSpan: 2, speedMultiplier: 1.5,
      effect: "fire", effort: "high", leftMotionVisible: false,
      rightMotionVisible: true, mediaType: "viewer-3d" };
    const snapshot = { cells: original, gridRows: 2, gridCols: 3,
      bpm: 96, skipStartPlacement: false };
    const saved = gridCellsToComposition("id", "test", snapshot);
    expect(saved.arrangement?.schemaVersion).toBe(1);
    expect(compositionToGridState(saved)).toEqual(snapshot);
    original[0]!.beatOffset = 99;
    expect(saved.arrangement?.cells[0]?.beatOffset).toBe(2);
  });

  it("loads older compositions without a versioned snapshot", () => {
    const saved = gridCellsToComposition("id", "test", { cells: cells(), gridRows: 2,
      gridCols: 2, bpm: 96, skipStartPlacement: false });
    delete saved.arrangement;
    expect(compositionToGridState(saved)).toMatchObject({
      gridRows: 2, gridCols: 2, bpm: 120, skipStartPlacement: true,
    });
  });

  it("rejects snapshots with unsupported versions or invalid grid geometry", () => {
    const snapshot = { schemaVersion: 2, cells: cells(), gridRows: 9,
      gridCols: 2, bpm: 96, skipStartPlacement: false };
    expect(() => validateArrangementSnapshot(snapshot)).toThrow();
  });
});
