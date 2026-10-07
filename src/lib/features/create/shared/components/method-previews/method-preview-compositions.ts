/**
 * Where each Create method preview scene puts its pieces, in box pixels, for
 * the three box shapes (method-preview-layout.ts). Pure numbers, so tests
 * and the bench (/test/create-method-previews) check them without drawing.
 */
import {
  gridCellSize,
  rowOfCells,
  type MethodPreviewShape,
} from "./method-preview-layout";

/** A square cell: its top-left corner and side, in box pixels. */
export interface CellRect {
  x: number;
  y: number;
  size: number;
}

/** The gap between cells: 5% of the box's short side, from 3 to 8px. */
export function previewGap(width: number, height: number): number {
  return Math.max(3, Math.min(8, Math.round(Math.min(width, height) * 0.05)));
}

export function cellCenter(cell: CellRect): { x: number; y: number } {
  return { x: cell.x + cell.size / 2, y: cell.y + cell.size / 2 };
}

function centeredRow(
  count: number,
  size: number,
  gap: number,
  width: number,
  height: number
): CellRect[] {
  const span = count * size + (count - 1) * gap;
  const x0 = Math.floor((width - span) / 2);
  const y = Math.floor((height - size) / 2);
  return Array.from({ length: count }, (_, index) => ({
    x: x0 + index * (size + gap),
    y,
    size,
  }));
}

/** Cells row by row, the way the step grid wraps. */
function centeredGrid(
  columns: number,
  rows: number,
  size: number,
  gap: number,
  width: number,
  height: number
): CellRect[] {
  const x0 = Math.floor((width - (columns * size + (columns - 1) * gap)) / 2);
  const y0 = Math.floor((height - (rows * size + (rows - 1) * gap)) / 2);
  const cells: CellRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({
        x: x0 + column * (size + gap),
        y: y0 + row * (size + gap),
        size,
      });
    }
  }
  return cells;
}

/** Construct: the start position, then its steps (plan: Spec Corrections 13). */
export const CONSTRUCT_STRIP_SLOTS = Object.freeze({ min: 3, max: 4 });
export const CONSTRUCT_ROOMY_SLOTS = Object.freeze({ min: 4, max: 4 });

export function constructLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): CellRect[] {
  const gap = previewGap(width, height);
  if (shape === "square") {
    const size = gridCellSize(width, height, 2, 2, gap);
    return size > 0 ? centeredGrid(2, 2, size, gap, width, height) : [];
  }
  const slots =
    shape === "roomy" ? CONSTRUCT_ROOMY_SLOTS : CONSTRUCT_STRIP_SLOTS;
  const { count, size } = rowOfCells(width, height, gap, slots.min, slots.max);
  return size > 0 ? centeredRow(count, size, gap, width, height) : [];
}

/** Generate: the dice, then the cells it fills. */
export const GENERATE_STRIP_SLOTS = Object.freeze({ min: 4, max: 5 });

/** A square uses a 3×3 grid only while its cells stay at least this large. */
export const GENERATE_MIN_GRID_CELL = 44;

export interface GenerateLayout {
  dice: CellRect;
  cells: CellRect[];
  /** Columns of the slot grid, dice included, for the wave bands. */
  columns: number;
}

export function generateLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): GenerateLayout | null {
  const gap = previewGap(width, height);
  let slots: CellRect[] = [];
  let columns = 0;
  if (shape === "square") {
    const wide = gridCellSize(width, height, 3, 3, gap);
    columns = wide >= GENERATE_MIN_GRID_CELL ? 3 : 2;
    const size = columns === 3 ? wide : gridCellSize(width, height, 2, 2, gap);
    if (size > 0) {
      slots = centeredGrid(columns, columns, size, gap, width, height);
    }
  } else {
    const { count, size } = rowOfCells(
      width,
      height,
      gap,
      GENERATE_STRIP_SLOTS.min,
      GENERATE_STRIP_SLOTS.max
    );
    columns = count;
    if (size > 0) slots = centeredRow(count, size, gap, width, height);
  }
  const [dice, ...cells] = slots;
  return dice ? { dice, cells, columns } : null;
}

/** Shape: a corner of the matrix and the stage its chosen cell grows into. */
export interface ShapeLayout {
  /** Side of one matrix cell. */
  cell: number;
  /** Top-left of the table. */
  x: number;
  y: number;
  /** Red-hand flower columns and blue-hand flower rows. */
  columns: number;
  rows: number;
  /** Whether red flowers head the columns. A short strip has no room. */
  columnHeads: boolean;
  /** The cell the highlight lands on. */
  chosen: { row: number; column: number };
  /** Where the chosen mandala finishes drawing. */
  stage: CellRect;
  /** False when the stage is the chosen cell itself. */
  grows: boolean;
}

/** A matrix cell's rect. Column heads, when shown, take the first row. */
export function shapeCellRect(
  layout: Pick<ShapeLayout, "cell" | "x" | "y" | "columnHeads">,
  row: number,
  column: number
): CellRect {
  return {
    x: layout.x + (column + 1) * layout.cell,
    y: layout.y + (row + (layout.columnHeads ? 1 : 0)) * layout.cell,
    size: layout.cell,
  };
}

export function shapeLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): ShapeLayout | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (shape === "strip") {
    // One blue flower and the cells that fit; the chosen cell draws in place.
    const { count, size } = rowOfCells(width, height, 0, 3, 4);
    if (size <= 0) return null;
    const table = {
      cell: size,
      x: Math.floor((width - count * size) / 2),
      y: Math.floor((height - size) / 2),
      columns: count - 1,
      rows: 1,
      columnHeads: false,
      chosen: { row: 0, column: 1 },
    };
    return { ...table, stage: shapeCellRect(table, 0, 1), grows: false };
  }
  if (shape === "roomy") {
    // The corner on the left, the stage as tall as the box on the right.
    const gap = previewGap(width, height);
    const cell = Math.floor(height / 3);
    const columns = Math.min(4, Math.floor((width - gap - height) / cell) - 1);
    if (cell > 0 && columns >= 2) {
      const x = Math.floor((width - ((columns + 1) * cell + gap + height)) / 2);
      return {
        cell,
        x,
        y: Math.floor((height - 3 * cell) / 2),
        columns,
        rows: 2,
        columnHeads: true,
        chosen: { row: 0, column: columns - 1 },
        stage: {
          x: x + (columns + 1) * cell + gap,
          y: 0,
          size: Math.floor(height),
        },
        grows: true,
      };
    }
  }
  // A 3×3 corner; the chosen cell grows over the 2×2 cells.
  const cell = Math.floor(Math.min(width, height) / 3);
  if (cell <= 0) return null;
  const x = Math.floor((width - 3 * cell) / 2);
  const y = Math.floor((height - 3 * cell) / 2);
  return {
    cell,
    x,
    y,
    columns: 2,
    rows: 2,
    columnHeads: true,
    chosen: { row: 0, column: 1 },
    stage: { x: x + cell, y: y + cell, size: 2 * cell },
    grows: true,
  };
}

/** Fuse: two blue and two red one-hand steps, and the two steps they make. */
export interface FuseLayout {
  blue: CellRect[];
  red: CellRect[];
  combined: CellRect[];
}

export function fuseLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): FuseLayout | null {
  if (!(width > 0) || !(height > 0)) return null;
  const gap = previewGap(width, height);
  if (shape === "square") {
    const small = Math.floor((Math.min(width, height) - 2 * gap) / 3);
    const big = Math.min(Math.floor((width - gap) / 2), Math.floor(height / 2));
    if (small <= 0 || big <= 0) return null;
    const pair = (y: number) =>
      centeredRow(2, small, gap, width, small).map((cell) => ({ ...cell, y }));
    return {
      blue: pair(0),
      red: pair(Math.floor(height) - small),
      combined: centeredRow(2, big, gap, width, height),
    };
  }
  const small = Math.min(
    Math.floor(height * 0.72),
    Math.floor((width - 3 * gap) / 4)
  );
  const big = Math.min(Math.floor(height), Math.floor((width - gap) / 2));
  if (small <= 0 || big <= 0) return null;
  const sources = centeredRow(4, small, gap, width, height);
  return {
    blue: sources.slice(0, 2),
    red: sources.slice(2),
    combined: centeredRow(2, big, gap, width, height),
  };
}

/** Tunnel: the tunnel, and the performer dice the finger presses. */
export interface TunnelLayout {
  stage: CellRect;
  dice: CellRect;
}

export function tunnelLayout(
  shape: MethodPreviewShape,
  width: number,
  height: number
): TunnelLayout | null {
  if (!(width > 0) || !(height > 0)) return null;
  const diceSize = (size: number) =>
    Math.max(14, Math.min(28, Math.round(size)));
  if (shape === "square") {
    const size = Math.floor(Math.min(width, height));
    const stage = {
      x: Math.floor((width - size) / 2),
      y: Math.floor((height - size) / 2),
      size,
    };
    const dice = diceSize(size * 0.18);
    const inset = Math.round(size * 0.04);
    return {
      stage,
      dice: {
        x: stage.x + size - inset - dice,
        y: stage.y + size - inset - dice,
        size: dice,
      },
    };
  }
  const gap = previewGap(width, height);
  const size = Math.floor(height);
  const dice = diceSize(height * 0.4);
  const x = Math.floor((width - (size + gap + dice)) / 2);
  return {
    stage: { x, y: 0, size },
    dice: {
      x: x + size + gap,
      y: Math.floor((height - dice) / 2),
      size: dice,
    },
  };
}

/** Assemble: the grid, square and centered. */
export function assembleLayout(width: number, height: number): CellRect | null {
  if (!(width > 0) || !(height > 0)) return null;
  const size = Math.floor(Math.min(width, height));
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    size,
  };
}
