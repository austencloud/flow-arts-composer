import { describe, expect, it } from "vitest";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import {
  ARRANGEMENT_MAX_BPM,
  ARRANGEMENT_MIN_BPM,
  canMoveCell,
  cellAt,
  clearCell,
  createArrangementCell,
  moveCell,
  occupiedPositions,
  resizeCell,
  setBpm,
  setCellAppearance,
  setCellLayers,
  setCellOffset,
  setGrid,
  setSkipStartPlacement,
  staggerCells,
  visibleCells,
} from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import {
  clearArrangementCell,
  setArrangementGrid,
  staggerArrangement,
} from "#lib/shared/media-composition/domain/post-project-edits.js";

const NOW = 1_700_000_000_000;

function layer(id: string, beats = 4): ArrangementCell["layers"][number] {
  return {
    sequence: { id, steps: Array.from({ length: beats }, () => ({})) },
    beatOffset: 0,
    propColors: { left: "#3575e2", right: "#ed1c24" },
    transformStack: [],
  } as unknown as ArrangementCell["layers"][number];
}

/** An 8×8 backing grid showing `rows × cols`, with the given cells placed over the blanks. */
function grid(
  rows: number,
  cols: number,
  placed: Partial<ArrangementCell>[] = []
): ArrangementSnapshot {
  const cells: ArrangementCell[] = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) cells.push(createArrangementCell(row, col));
  for (const partial of placed) {
    const index = partial.row! * 8 + partial.col!;
    cells[index] = { ...cells[index]!, ...partial };
  }
  return {
    schemaVersion: 2,
    cells,
    gridRows: rows,
    gridCols: cols,
    bpm: 120,
    skipStartPlacement: true,
  };
}

function filled(row: number, col: number, beats = 4, extra: Partial<ArrangementCell> = {}) {
  return { row, col, layers: [layer(`seq-${row}-${col}`, beats)], ...extra };
}

describe("setGrid", () => {
  it("clamps to 1..8, shrinks overflowing spans and keeps cells outside the grid", () => {
    const start = grid(4, 4, [
      filled(0, 0, 4, { colSpan: 3, rowSpan: 2 }),
      filled(3, 3),
    ]);
    const next = setGrid(start, 0, 9);
    expect(next.gridRows).toBe(1);
    expect(next.gridCols).toBe(8);
    expect(cellAt(next, 0, 0)).toMatchObject({ colSpan: 3, rowSpan: 1 });
    expect(cellAt(next, 3, 3)?.layers).toHaveLength(1);
    expect(next.cells).toHaveLength(64);
    expect(visibleCells(next).map((cell) => cell.id)).toEqual(
      Array.from({ length: 8 }, (_, col) => `cell-0-${col}`)
    );
    expect(setGrid(start, 4, 4)).toBe(start);
    expect(setGrid(setGrid(start, 1, 1), 4, 4).cells[27]?.layers).toHaveLength(1);
  });
});

describe("moveCell", () => {
  it("swaps content between two positions and keeps positional ids", () => {
    const start = grid(2, 2, [
      filled(0, 0, 4, { beatOffset: 2, speedMultiplier: 1.5, appearance: { props: false } }),
      filled(1, 1, 8),
    ]);
    const next = moveCell(start, "cell-0-0", 1, 1);
    expect(next).not.toBe(start);
    expect(cellAt(next, 1, 1)).toMatchObject({
      id: "cell-1-1",
      beatOffset: 2,
      speedMultiplier: 1.5,
      appearance: { props: false },
    });
    expect(cellAt(next, 1, 1)?.layers[0]?.sequence.id).toBe("seq-0-0");
    expect(cellAt(next, 0, 0)).toMatchObject({ id: "cell-0-0", beatOffset: 0 });
    expect(cellAt(next, 0, 0)?.layers[0]?.sequence.id).toBe("seq-1-1");
    expect(cellAt(next, 0, 0)).not.toHaveProperty("speedMultiplier");
    expect(cellAt(next, 0, 0)).not.toHaveProperty("appearance");
  });

  it("carries a span with its cell and swaps the empty cell back", () => {
    const start = grid(2, 3, [filled(0, 0, 4, { colSpan: 2 })]);
    const next = moveCell(start, "cell-0-0", 1, 0);
    expect(cellAt(next, 1, 0)).toMatchObject({ colSpan: 2, rowSpan: 1 });
    expect(cellAt(next, 1, 0)?.layers).toHaveLength(1);
    expect(cellAt(next, 0, 0)).toMatchObject({ colSpan: 1, layers: [] });
    expect(occupiedPositions(next).get("1-1")).toBe("cell-1-0");
  });

  it("refuses a covered target, an overflowing span and a blocked landing", () => {
    const start = grid(2, 3, [
      filled(0, 0, 4, { colSpan: 2 }),
      filled(1, 2),
    ]);
    expect(canMoveCell(start, "cell-0-0", 0, 1)).toBe(false);
    expect(moveCell(start, "cell-0-0", 0, 1)).toBe(start);
    expect(canMoveCell(start, "cell-0-0", 0, 2)).toBe(false);
    expect(canMoveCell(start, "cell-0-0", 1, 1)).toBe(false);
    expect(canMoveCell(start, "cell-0-0", 1, 0)).toBe(true);
    expect(canMoveCell(start, "cell-0-0", 0, 0)).toBe(false);
    expect(canMoveCell(start, "cell-0-0", 2, 0)).toBe(false);
    expect(canMoveCell(start, "missing", 1, 0)).toBe(false);
  });

  it("creates the target record in a sparse snapshot", () => {
    const sparse: ArrangementSnapshot = {
      ...grid(2, 2),
      cells: [{ ...createArrangementCell(0, 0), layers: [layer("only")] }],
    };
    const next = moveCell(sparse, "cell-0-0", 1, 1);
    expect(next.cells).toHaveLength(2);
    expect(cellAt(next, 1, 1)?.layers[0]?.sequence.id).toBe("only");
    expect(cellAt(next, 0, 0)?.layers).toEqual([]);
  });
});

describe("resizeCell", () => {
  it("clamps to the grid and stops at a neighbour that holds layers", () => {
    const start = grid(3, 3, [filled(0, 0), filled(0, 2), filled(2, 0)]);
    const wide = resizeCell(start, "cell-0-0", 5, 1);
    expect(cellAt(wide, 0, 0)).toMatchObject({ colSpan: 2, rowSpan: 1 });
    const tall = resizeCell(start, "cell-0-0", 1, 5);
    expect(cellAt(tall, 0, 0)).toMatchObject({ colSpan: 1, rowSpan: 2 });
    const both = resizeCell(start, "cell-0-0", 3, 3);
    expect(cellAt(both, 0, 0)).toMatchObject({ colSpan: 2, rowSpan: 2 });
  });

  it("grows over empty neighbours, keeps its own ground and is a no-op when unchanged", () => {
    const start = grid(4, 4, [filled(1, 1, 4, { colSpan: 2, rowSpan: 2 })]);
    const grown = resizeCell(start, "cell-1-1", 3, 3);
    expect(cellAt(grown, 1, 1)).toMatchObject({ colSpan: 3, rowSpan: 3 });
    const shrunk = resizeCell(grown, "cell-1-1", 1, 1);
    expect(cellAt(shrunk, 1, 1)).toMatchObject({ colSpan: 1, rowSpan: 1 });
    expect(resizeCell(start, "cell-1-1", 2, 2)).toBe(start);
    expect(resizeCell(start, "cell-7-7", 2, 2)).toBe(start);
  });

  it("limits rows by the narrowest free row across the chosen columns", () => {
    const start = grid(3, 3, [filled(0, 0), filled(1, 1)]);
    const next = resizeCell(start, "cell-0-0", 2, 3);
    expect(cellAt(next, 0, 0)).toMatchObject({ colSpan: 2, rowSpan: 1 });
  });
});

describe("cell content edits", () => {
  it("replaces layers up to four", () => {
    const start = grid(1, 1);
    const four = [layer("a"), layer("b"), layer("c"), layer("d")];
    const next = setCellLayers(start, "cell-0-0", four);
    expect(cellAt(next, 0, 0)?.layers).toHaveLength(4);
    expect(cellAt(next, 0, 0)?.layers).not.toBe(four);
    expect(setCellLayers(start, "cell-0-0", [...four, layer("e")])).toBe(start);
    expect(setCellLayers(start, "missing", four)).toBe(start);
  });

  it("floors the beat offset at 0 and clamps the speed", () => {
    const start = grid(1, 1, [filled(0, 0)]);
    expect(cellAt(setCellOffset(start, "cell-0-0", { beatOffset: -3 }), 0, 0)?.beatOffset).toBe(0);
    expect(cellAt(setCellOffset(start, "cell-0-0", { beatOffset: 2.5 }), 0, 0)?.beatOffset).toBe(2.5);
    expect(cellAt(setCellOffset(start, "cell-0-0", { speedMultiplier: 0.1 }), 0, 0)?.speedMultiplier).toBe(0.25);
    expect(cellAt(setCellOffset(start, "cell-0-0", { speedMultiplier: 9 }), 0, 0)?.speedMultiplier).toBe(4);
    expect(setCellOffset(start, "cell-0-0", { beatOffset: 0 })).toBe(start);
    expect(setCellOffset(start, "cell-0-0", { beatOffset: Number.NaN })).toBe(start);
    expect(setCellOffset(start, "missing", { beatOffset: 1 })).toBe(start);
  });

  it("sets, replaces and removes a cell's or the grid's appearance", () => {
    const start = grid(1, 1, [filled(0, 0)]);
    const withCell = setCellAppearance(start, "cell-0-0", { props: false });
    expect(cellAt(withCell, 0, 0)?.appearance).toEqual({ props: false });
    expect(setCellAppearance(withCell, "cell-0-0", { props: false })).toBe(withCell);
    const cleared = setCellAppearance(withCell, "cell-0-0", undefined);
    expect(cellAt(cleared, 0, 0)).not.toHaveProperty("appearance");
    const withGrid = setCellAppearance(start, null, { darkMode: true });
    expect(withGrid.appearance).toEqual({ darkMode: true });
    expect(setCellAppearance(withGrid, null, { darkMode: true })).toBe(withGrid);
    expect(setCellAppearance(withGrid, null, undefined)).not.toHaveProperty("appearance");
    expect(setCellAppearance(start, "missing", { props: false })).toBe(start);
  });

  it("clears layers and offset together", () => {
    const start = grid(1, 1, [filled(0, 0, 4, { beatOffset: 3, colSpan: 1 })]);
    const next = clearCell(start, "cell-0-0");
    expect(cellAt(next, 0, 0)).toMatchObject({ layers: [], beatOffset: 0 });
    expect(clearCell(next, "cell-0-0")).toBe(next);
  });

  it("toggles the start placement", () => {
    const start = grid(1, 1);
    expect(setSkipStartPlacement(start, true)).toBe(start);
    expect(setSkipStartPlacement(start, false).skipStartPlacement).toBe(false);
  });
});

describe("staggerCells", () => {
  it("offsets the visible cells with layers in reading order and skips the rest", () => {
    const start = grid(2, 2, [
      filled(1, 0),
      filled(0, 1),
      filled(0, 0),
      filled(3, 3, 4, { beatOffset: 7 }),
    ]);
    const next = staggerCells(start, 2);
    expect(cellAt(next, 0, 0)?.beatOffset).toBe(0);
    expect(cellAt(next, 0, 1)?.beatOffset).toBe(2);
    expect(cellAt(next, 1, 0)?.beatOffset).toBe(4);
    expect(cellAt(next, 1, 1)?.beatOffset).toBe(0);
    expect(cellAt(next, 3, 3)?.beatOffset).toBe(7);
    expect(staggerCells(next, 2)).toBe(next);
    expect(cellAt(staggerCells(next, -1), 0, 1)?.beatOffset).toBe(0);
  });
});

describe("arrangement edits on a project", () => {
  function project(snapshot: ArrangementSnapshot) {
    const built = createArrangementProject(snapshot, "studio-arrangement:a", NOW);
    const item = built.tracks[0]!.items[0]!;
    return { project: built, itemId: item.id };
  }

  it("changes the clip length when the visible grid changes", () => {
    const { project: start, itemId } = project(
      grid(1, 2, [filled(0, 0, 4), filled(0, 1, 6)])
    );
    const before = start.tracks[0]!.items[0]!;
    expect(before.kind).toBe("arrangement");
    expect(before.duration).toBeCloseTo(6);
    const next = setArrangementGrid(start, itemId, 1, 1, { now: NOW + 1 });
    const after = next.tracks[0]!.items[0]!;
    expect(after.kind).toBe("arrangement");
    if (after.kind !== "arrangement") return;
    expect(after.snapshot.gridCols).toBe(1);
    expect(after.sourceOut).toBeCloseTo(2);
    expect(after.duration).toBeCloseTo(2);
    expect(next.updatedAt).toBe(NOW + 1);
  });

  it("returns the same project for a no-op or another kind of item", () => {
    const { project: start, itemId } = project(grid(2, 2, [filled(0, 0), filled(1, 1)]));
    expect(setArrangementGrid(start, itemId, 2, 2, { now: NOW + 1 })).toBe(start);
    expect(clearArrangementCell(start, itemId, "cell-0-1", { now: NOW + 1 })).toBe(start);
    expect(staggerArrangement(start, "missing", 1, { now: NOW + 1 })).toBe(start);
    const staggered = staggerArrangement(start, itemId, 1, { now: NOW + 1 });
    const item = staggered.tracks[0]!.items[0]!;
    if (item.kind !== "arrangement") throw new Error("expected an arrangement");
    expect(cellAt(item.snapshot, 1, 1)?.beatOffset).toBe(1);
  });
});

describe("setBpm", () => {
  it("clamps to the arrangement's range and is identity on no change", () => {
    const base = grid(1, 1, []);
    expect(setBpm(base, 120)).toBe(base);
    expect(setBpm(base, 90).bpm).toBe(90);
    expect(setBpm(base, 1).bpm).toBe(ARRANGEMENT_MIN_BPM);
    expect(setBpm(base, 9999).bpm).toBe(ARRANGEMENT_MAX_BPM);
    expect(setBpm(base, Number.NaN)).toBe(base);
  });
});
