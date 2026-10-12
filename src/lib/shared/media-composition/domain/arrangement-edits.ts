import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import type {
  TipEffectMap,
  TipEffortMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
import {
  ARRANGEMENT_MAX_GRID_SIZE,
  type ArrangementCell,
  type ArrangementSnapshot,
} from "./arrangement.js";
import type { PostAnimationAppearance } from "./post-animation-appearance.js";

/**
 * Pure edits on an arrangement snapshot: the grid the Studio preview and its
 * panels change. Each returns the snapshot it was given when nothing changes,
 * so `post-project-edits` can skip the timeline step and the undo entry.
 *
 * Positions are `row`/`col` in the backing grid; a cell covers
 * `colSpan × rowSpan` positions from its origin. Only cells inside
 * `gridRows × gridCols` show and take part in the overlap rules; the rest
 * stay in the array so growing the grid brings them back. An empty 1×1 cell
 * under another cell's span stays in the array too, hidden, as the nested
 * Arrange editor has always kept it.
 */

export const ARRANGEMENT_MAX_LAYERS = 4;
export const ARRANGEMENT_MIN_CELL_SPEED = 0.25;
export const ARRANGEMENT_MAX_CELL_SPEED = 4;
/** The tempo range of an arrangement, the same as a music take's. */
export const ARRANGEMENT_MIN_BPM = 20;
export const ARRANGEMENT_MAX_BPM = 300;

export interface ArrangementCellOffset {
  /** Beats before this cell starts; floored at 0. */
  beatOffset?: number;
  /** Playback rate of this cell against the grid; clamped to 0.25..4. */
  speedMultiplier?: number;
}

interface Rect {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/** The content that travels when a cell moves; `id`, `row` and `col` name the position and stay. */
type CellContent = Omit<ArrangementCell, "id" | "row" | "col">;

export function arrangementCellId(row: number, col: number): string {
  return `cell-${row}-${col}`;
}

export function createArrangementCell(row: number, col: number): ArrangementCell {
  return {
    id: arrangementCellId(row, col),
    row,
    col,
    layers: [],
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation",
  };
}

export function isVisibleCell(
  cell: ArrangementCell,
  snapshot: ArrangementSnapshot
): boolean {
  return cell.row < snapshot.gridRows && cell.col < snapshot.gridCols;
}

/** Visible cells in reading order: row by row, left to right. */
export function visibleCells(snapshot: ArrangementSnapshot): ArrangementCell[] {
  return snapshot.cells
    .filter((cell) => isVisibleCell(cell, snapshot))
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

export function cellAt(
  snapshot: ArrangementSnapshot,
  row: number,
  col: number
): ArrangementCell | undefined {
  return snapshot.cells.find((cell) => cell.row === row && cell.col === col);
}

/** Positions a visible cell covers beyond its origin, keyed `row-col`, with the id of the cell covering them. */
export function occupiedPositions(
  snapshot: ArrangementSnapshot
): Map<string, string> {
  const occupied = new Map<string, string>();
  for (const cell of snapshot.cells) {
    if (!isVisibleCell(cell, snapshot)) continue;
    for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
        if (r === cell.row && c === cell.col) continue;
        occupied.set(`${r}-${c}`, cell.id);
      }
    }
  }
  return occupied;
}

function rectOf(cell: ArrangementCell): Rect {
  return {
    row: cell.row,
    col: cell.col,
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
  };
}

function rectInside(rect: Rect, snapshot: ArrangementSnapshot): boolean {
  return (
    rect.row >= 0 &&
    rect.col >= 0 &&
    rect.row + rect.rowSpan <= snapshot.gridRows &&
    rect.col + rect.colSpan <= snapshot.gridCols
  );
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.row < b.row + b.rowSpan &&
    b.row < a.row + a.rowSpan &&
    a.col < b.col + b.colSpan &&
    b.col < a.col + a.colSpan
  );
}

function rectCovers(rect: Rect, row: number, col: number): boolean {
  return (
    row >= rect.row &&
    row < rect.row + rect.rowSpan &&
    col >= rect.col &&
    col < rect.col + rect.colSpan
  );
}

/** A visible cell that keeps its ground: it holds layers or spans more than one position. */
function blocks(cell: ArrangementCell): boolean {
  return cell.layers.length > 0 || cell.colSpan > 1 || cell.rowSpan > 1;
}

/** The rects of the visible cells that block, other than the ones named. */
function blockingRects(
  snapshot: ArrangementSnapshot,
  except: ReadonlySet<string>
): Rect[] {
  return snapshot.cells
    .filter(
      (cell) =>
        !except.has(cell.id) && isVisibleCell(cell, snapshot) && blocks(cell)
    )
    .map(rectOf);
}

function clampDimension(n: number): number {
  return Math.max(1, Math.min(ARRANGEMENT_MAX_GRID_SIZE, Math.round(n)));
}

function replaceCell(
  snapshot: ArrangementSnapshot,
  cellId: string,
  next: ArrangementCell
): ArrangementSnapshot {
  return {
    ...snapshot,
    cells: snapshot.cells.map((cell) => (cell.id === cellId ? next : cell)),
  };
}

function findCell(
  snapshot: ArrangementSnapshot,
  cellId: string
): ArrangementCell | undefined {
  return snapshot.cells.find((cell) => cell.id === cellId);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Rows × cols, clamped to the backing grid. Spans that would overflow shrink;
 * cells that fall outside stay in the array for the grid to grow back over.
 */
export function setGrid(
  snapshot: ArrangementSnapshot,
  rows: number,
  cols: number
): ArrangementSnapshot {
  const gridRows = clampDimension(rows);
  const gridCols = clampDimension(cols);
  if (gridRows === snapshot.gridRows && gridCols === snapshot.gridCols)
    return snapshot;
  const cells = snapshot.cells.map((cell) => {
    const colSpan = Math.max(1, Math.min(cell.colSpan, gridCols - cell.col));
    const rowSpan = Math.max(1, Math.min(cell.rowSpan, gridRows - cell.row));
    return colSpan === cell.colSpan && rowSpan === cell.rowSpan
      ? cell
      : { ...cell, colSpan, rowSpan };
  });
  return { ...snapshot, gridRows, gridCols, cells };
}

export function setSkipStartPlacement(
  snapshot: ArrangementSnapshot,
  skipStartPlacement: boolean
): ArrangementSnapshot {
  return snapshot.skipStartPlacement === skipStartPlacement
    ? snapshot
    : { ...snapshot, skipStartPlacement };
}

/**
 * Whether `cellId` can swap places with the cell at `row`,`col`: both land
 * inside the grid with their own spans and on no blocking cell. A position
 * inside another cell's span is not a target.
 */
export function canMoveCell(
  snapshot: ArrangementSnapshot,
  cellId: string,
  row: number,
  col: number
): boolean {
  const source = findCell(snapshot, cellId);
  if (!source || !isVisibleCell(source, snapshot)) return false;
  if (row === source.row && col === source.col) return false;
  if (row < 0 || col < 0 || row >= snapshot.gridRows || col >= snapshot.gridCols)
    return false;
  if (occupiedPositions(snapshot).has(`${row}-${col}`)) return false;
  const target = cellAt(snapshot, row, col);
  const moved: Rect = {
    row,
    col,
    rowSpan: source.rowSpan,
    colSpan: source.colSpan,
  };
  const swapped: Rect = {
    row: source.row,
    col: source.col,
    rowSpan: target?.rowSpan ?? 1,
    colSpan: target?.colSpan ?? 1,
  };
  if (!rectInside(moved, snapshot) || !rectInside(swapped, snapshot))
    return false;
  if (rectsOverlap(moved, swapped)) return false;
  const except = new Set([source.id, ...(target ? [target.id] : [])]);
  return blockingRects(snapshot, except).every(
    (other) => !rectsOverlap(moved, other) && !rectsOverlap(swapped, other)
  );
}

function contentOf(cell: ArrangementCell): CellContent {
  const { id: _id, row: _row, col: _col, ...content } = cell;
  return content;
}

function withContent(
  position: ArrangementCell,
  content: CellContent
): ArrangementCell {
  return { id: position.id, row: position.row, col: position.col, ...content };
}

function uniqueCellId(
  snapshot: ArrangementSnapshot,
  row: number,
  col: number
): string {
  const base = arrangementCellId(row, col);
  if (!findCell(snapshot, base)) return base;
  let n = 2;
  while (findCell(snapshot, `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Swaps the content of `cellId` and the cell at `row`,`col`, each keeping its
 * own span. An invalid move returns the snapshot unchanged. A position with no
 * record yet gets one so a sparse snapshot can still be arranged.
 */
export function moveCell(
  snapshot: ArrangementSnapshot,
  cellId: string,
  row: number,
  col: number
): ArrangementSnapshot {
  if (!canMoveCell(snapshot, cellId, row, col)) return snapshot;
  const source = findCell(snapshot, cellId)!;
  const existing = cellAt(snapshot, row, col);
  const target = existing ?? {
    ...createArrangementCell(row, col),
    id: uniqueCellId(snapshot, row, col),
  };
  const cells = existing ? snapshot.cells : [...snapshot.cells, target];
  const sourceContent = contentOf(source);
  const targetContent = contentOf(target);
  return {
    ...snapshot,
    cells: cells.map((cell) =>
      cell.id === source.id
        ? withContent(cell, targetContent)
        : cell.id === target.id
          ? withContent(cell, sourceContent)
          : cell
    ),
  };
}

/**
 * Spans for `cellId`, clamped to the grid and then to free neighbours: as many
 * columns along the origin row as are free, then as many rows across those
 * columns. A neighbour is free when no blocking cell covers it; the positions
 * the cell already covers stay its own.
 */
export function resizeCell(
  snapshot: ArrangementSnapshot,
  cellId: string,
  colSpan: number,
  rowSpan: number
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell || !isVisibleCell(cell, snapshot)) return snapshot;
  const wantCols = Math.max(
    1,
    Math.min(Math.round(colSpan), snapshot.gridCols - cell.col)
  );
  const wantRows = Math.max(
    1,
    Math.min(Math.round(rowSpan), snapshot.gridRows - cell.row)
  );
  const own = rectOf(cell);
  const blocked = blockingRects(snapshot, new Set([cell.id]));
  const free = (r: number, c: number): boolean =>
    rectCovers(own, r, c) || !blocked.some((rect) => rectCovers(rect, r, c));
  let cols = 1;
  while (cols < wantCols && free(cell.row, cell.col + cols)) cols++;
  const rowFree = (r: number): boolean => {
    for (let c = cell.col; c < cell.col + cols; c++) if (!free(r, c)) return false;
    return true;
  };
  let rows = 1;
  while (rows < wantRows && rowFree(cell.row + rows)) rows++;
  if (cols === cell.colSpan && rows === cell.rowSpan) return snapshot;
  return replaceCell(snapshot, cellId, { ...cell, colSpan: cols, rowSpan: rows });
}

/** The cell's layers, at most four. More than four, or an unknown cell, changes nothing. */
export function setCellLayers(
  snapshot: ArrangementSnapshot,
  cellId: string,
  layers: TunnelLayerConfig[]
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell || layers.length > ARRANGEMENT_MAX_LAYERS) return snapshot;
  if (cell.layers === layers) return snapshot;
  return replaceCell(snapshot, cellId, { ...cell, layers: [...layers] });
}

/** Beat offset floored at 0 and speed clamped to 0.25..4; a field left out keeps its value. */
export function setCellOffset(
  snapshot: ArrangementSnapshot,
  cellId: string,
  offset: ArrangementCellOffset
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  let next = cell;
  if (offset.beatOffset !== undefined && Number.isFinite(offset.beatOffset)) {
    const beatOffset = Math.max(0, offset.beatOffset);
    if (beatOffset !== cell.beatOffset) next = { ...next, beatOffset };
  }
  if (
    offset.speedMultiplier !== undefined &&
    Number.isFinite(offset.speedMultiplier)
  ) {
    const speedMultiplier = Math.max(
      ARRANGEMENT_MIN_CELL_SPEED,
      Math.min(ARRANGEMENT_MAX_CELL_SPEED, offset.speedMultiplier)
    );
    if (speedMultiplier !== cell.speedMultiplier)
      next = { ...next, speedMultiplier };
  }
  return next === cell ? snapshot : replaceCell(snapshot, cellId, next);
}

/** The grid's tempo, clamped to 20..300 BPM. The clip rescale lives in `setArrangementBpm`. */
export function setBpm(
  snapshot: ArrangementSnapshot,
  bpm: number
): ArrangementSnapshot {
  if (!Number.isFinite(bpm)) return snapshot;
  const next = Math.max(
    ARRANGEMENT_MIN_BPM,
    Math.min(ARRANGEMENT_MAX_BPM, bpm)
  );
  return next === snapshot.bpm ? snapshot : { ...snapshot, bpm: next };
}

/** The look for one cell, or for the grid when `cellId` is null; `undefined` removes it. */
export function setCellAppearance(
  snapshot: ArrangementSnapshot,
  cellId: string | null,
  appearance: PostAnimationAppearance | undefined
): ArrangementSnapshot {
  if (cellId === null) {
    if (sameJson(snapshot.appearance, appearance)) return snapshot;
    const { appearance: _previous, ...rest } = snapshot;
    return appearance ? { ...rest, appearance } : rest;
  }
  const cell = findCell(snapshot, cellId);
  if (!cell || sameJson(cell.appearance, appearance)) return snapshot;
  const { appearance: _previous, ...rest } = cell;
  return replaceCell(snapshot, cellId, appearance ? { ...rest, appearance } : rest);
}

/** Per-hand and per-tip effects for one cell; an empty map removes the field. */
export function setCellTipEffects(
  snapshot: ArrangementSnapshot,
  cellId: string,
  map: TipEffectMap | undefined
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const next = map && Object.keys(map).length > 0 ? map : undefined;
  if (sameJson(cell.tipEffectMap, next)) return snapshot;
  const { tipEffectMap: _previous, ...rest } = cell;
  return replaceCell(
    snapshot,
    cellId,
    next ? { ...rest, tipEffectMap: next } : rest
  );
}

/** Per-hand and per-tip efforts for one cell; an empty map removes the field. */
export function setCellTipEfforts(
  snapshot: ArrangementSnapshot,
  cellId: string,
  map: TipEffortMap | undefined
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const next = map && Object.keys(map).length > 0 ? map : undefined;
  if (sameJson(cell.tipEffortMap, next)) return snapshot;
  const { tipEffortMap: _previous, ...rest } = cell;
  return replaceCell(
    snapshot,
    cellId,
    next ? { ...rest, tipEffortMap: next } : rest
  );
}

/** Which hands a cell draws. Shown is the default, so a shown hand carries no flag. */
export function setCellMotionVisibility(
  snapshot: ArrangementSnapshot,
  cellId: string,
  visible: { left?: boolean; right?: boolean }
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const left = visible.left ?? cell.leftMotionVisible ?? true;
  const right = visible.right ?? cell.rightMotionVisible ?? true;
  const { leftMotionVisible: _left, rightMotionVisible: _right, ...rest } = cell;
  const next: ArrangementCell = {
    ...rest,
    ...(left ? {} : { leftMotionVisible: false }),
    ...(right ? {} : { rightMotionVisible: false }),
  };
  return sameJson(cell, next) ? snapshot : replaceCell(snapshot, cellId, next);
}

/** Empties the cell: no layers, no offset. Its span, look and media type stay. */
export function clearCell(
  snapshot: ArrangementSnapshot,
  cellId: string
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell || (cell.layers.length === 0 && cell.beatOffset === 0))
    return snapshot;
  return replaceCell(snapshot, cellId, { ...cell, layers: [], beatOffset: 0 });
}

/** Offsets the visible cells that hold layers by `beatsPerCell` each, in reading order: 0, 1×, 2×, … */
export function staggerCells(
  snapshot: ArrangementSnapshot,
  beatsPerCell: number
): ArrangementSnapshot {
  const step = Number.isFinite(beatsPerCell) ? Math.max(0, beatsPerCell) : 0;
  const offsets = new Map<string, number>();
  visibleCells(snapshot)
    .filter((cell) => cell.layers.length > 0)
    .forEach((cell, index) => offsets.set(cell.id, index * step));
  let changed = false;
  const cells = snapshot.cells.map((cell) => {
    const beatOffset = offsets.get(cell.id);
    if (beatOffset === undefined || beatOffset === cell.beatOffset) return cell;
    changed = true;
    return { ...cell, beatOffset };
  });
  return changed ? { ...snapshot, cells } : snapshot;
}
