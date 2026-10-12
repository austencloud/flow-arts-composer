import { describe, expect, it } from "vitest";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import { createArrangementCell } from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { boxLocalPoint } from "@austencloud/video-editor/ui";
import {
  cellAtPoint,
  cellFrame,
  openCells,
  positionAtPoint,
} from "#lib/shared/post-studio-plugin/ui/post-arrangement-hit.js";

const layer = {
  sequence: { id: "s", steps: [] },
  beatOffset: 0,
  propColors: { left: "#000", right: "#fff" },
  transformStack: [],
} as unknown as ArrangementCell["layers"][number];

function grid(
  rows: number,
  cols: number,
  placed: Partial<ArrangementCell>[]
): ArrangementSnapshot {
  const cells: ArrangementCell[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) cells.push(createArrangementCell(row, col));
  }
  for (const patch of placed) {
    const index = cells.findIndex((c) => c.id === patch.id);
    cells[index] = { ...cells[index]!, ...patch };
  }
  return {
    schemaVersion: 2,
    cells,
    gridRows: rows,
    gridCols: cols,
    bpm: 120,
    skipStartPlacement: false,
  };
}

describe("boxLocalPoint", () => {
  it("reads a frame point as fractions of an unturned box", () => {
    const box = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(boxLocalPoint(box, 0.5, 0.375, 16 / 9)).toEqual({ u: 0.5, v: 0.25 });
    expect(boxLocalPoint(box, 0.25, 0.25, 1)).toEqual({ u: 0, v: 0 });
  });

  it("reads a box turned half way round back to front", () => {
    const box = { x: 0.25, y: 0.25, width: 0.5, height: 0.5, turn: 180 };
    const { u, v } = boxLocalPoint(box, 0.375, 0.625, 1);
    expect(u).toBeCloseTo(0.75);
    expect(v).toBeCloseTo(0.25);
  });
});

describe("positionAtPoint", () => {
  it("floors into the grid and refuses the far edges", () => {
    const snapshot = grid(2, 3, []);
    expect(positionAtPoint(snapshot, 0.99, 0.5)).toEqual({ row: 1, col: 2 });
    expect(positionAtPoint(snapshot, 0, 0)).toEqual({ row: 0, col: 0 });
    expect(positionAtPoint(snapshot, 1, 0.5)).toBeNull();
    expect(positionAtPoint(snapshot, 0.5, -0.01)).toBeNull();
  });
});

describe("cellAtPoint", () => {
  const snapshot = grid(2, 2, [
    { id: "cell-0-0", colSpan: 2, layers: [layer] },
    { id: "cell-1-1", layers: [layer] },
  ]);

  it("gives a spanned position to the cell that covers it", () => {
    expect(cellAtPoint(snapshot, 0.75, 0.25)?.id).toBe("cell-0-0");
    expect(cellAtPoint(snapshot, 0.25, 0.75)?.id).toBe("cell-1-0");
    expect(cellAtPoint(snapshot, 0.75, 0.75)?.id).toBe("cell-1-1");
  });

  it("finds nothing outside the box", () => {
    expect(cellAtPoint(snapshot, -0.1, 0.5)).toBeNull();
    expect(cellAtPoint(snapshot, 0.5, 1)).toBeNull();
  });
});

describe("cellFrame", () => {
  it("clamps a span that runs past the grid", () => {
    const snapshot = grid(2, 3, [{ id: "cell-0-2", colSpan: 3, rowSpan: 4 }]);
    const cell = snapshot.cells.find((c) => c.id === "cell-0-2")!;
    expect(cellFrame(snapshot, cell)).toEqual({
      left: 2 / 3,
      top: 0,
      width: 1 / 3,
      height: 1,
    });
  });
});

describe("openCells", () => {
  it("lists empty positions with their spans and skips covered ones", () => {
    const snapshot = grid(2, 2, [
      { id: "cell-0-0", colSpan: 2, layers: [layer] },
      { id: "cell-1-0", colSpan: 2 },
    ]);
    expect(openCells(snapshot)).toEqual([
      {
        key: "cell-1-0",
        cellId: "cell-1-0",
        row: 1,
        col: 0,
        rowSpan: 1,
        colSpan: 2,
      },
    ]);
  });

  it("lists a position with no record as open without an id", () => {
    const snapshot: ArrangementSnapshot = { ...grid(1, 2, []), cells: [] };
    expect(openCells(snapshot).map((open) => open.cellId)).toEqual([
      null,
      null,
    ]);
  });
});
