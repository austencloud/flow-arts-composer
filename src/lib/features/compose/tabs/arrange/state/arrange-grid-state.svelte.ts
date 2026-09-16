/**
 * Arrange Grid State
 *
 * Orchestrator for the Arrange tab grid composition mode.
 * Delegates beat calculation, persistence, playback, and transforms
 * to dedicated services via DI.
 *
 * Supports a user-configurable grid (1-8 rows, 1-8 columns).
 * Backing array is always MAX_GRID_SIZE x MAX_GRID_SIZE (64 cells).
 * Only cells within the current gridRows x gridCols are visible.
 *
 * Each visible cell is a "tunnel" that can hold up to 4 performers/layers.
 * Global sync playback: one play button controls all cells together,
 * with optional per-cell beat offsets.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  type TunnelLayerConfig,
  type TransformType,
  type AppliedTransform,
  type CellEffect,
  getTunnelLayerColors,
} from "$lib/shared/animation-engine/domain/compose-types";

import type {
  CellMediaType,
  PropColors,
} from "$lib/shared/animation-engine/domain/compose-types";
import type { Composition } from "$lib/shared/animation-engine/domain/compose-types";
import type { TrailMode } from "$lib/shared/animation-engine/domain/types/trail-types";
import type {
  TipEffectMap,
  TipEffortMap,
} from "$lib/shared/animation-engine/domain/types/tip-effect-types";
// compose-arrange-container dissolved - services accessed via module singleton getters
import type {
  ArrangeUndoOperationType,
  ArrangeGridSnapshot,
} from "../services/types";

import { serializeGrid } from "../services/arrange-grid-serializer";
import {
  gridCellsToComposition,
  compositionToGridState,
} from "../services/arrange-composition-converter";
import {
  loadGrid,
  saveGrid,
  migrateLocalStorageCompositions,
} from "../services/arrange-grid-persister";
import { calculateTotalBeats } from "../services/arrange-step-calculator";
import { applyTransform } from "../services/arrange-layer-transformer";
import { compositionSyncer } from "../../../services/composition-syncer";
import { getComposition as dexieGetComposition } from "../../../services/dexie-composition-repository";

import { getArrangeUndoManager } from "$lib/features/compose/tabs/arrange/get-arrange-undo-manager";
import { getArrangePlaybackEngine } from "$lib/features/compose/tabs/arrange/get-arrange-playback-engine";

// Maximum backing array dimensions (8x8 = 64 cells)
export const MAX_GRID_SIZE = 8;
const MAX_LAYERS_PER_CELL = 4;

/**
 * A single cell in the grid - each cell is a mini-tunnel
 */
export interface GridCell {
  id: string;
  /** Row position (0-7) */
  row: number;
  /** Column position (0-7) */
  col: number;
  layers: TunnelLayerConfig[];
  beatOffset: number;
  /** Number of columns this cell spans (1-8) */
  colSpan: number;
  /** Number of rows this cell spans (1-8) */
  rowSpan: number;
  /** Media type for this cell (default: animation for tunnel mode) */
  mediaType: CellMediaType;
  // Per-cell overrides (undefined = global default)
  speedMultiplier?: number;
  effect?: CellEffect;
  trailMode?: TrailMode;
  effort?: string;
  /** Per-tip effect assignments that override the global TipEffectMap for this cell */
  tipEffectMap?: TipEffectMap;
  /** Per-tip effort assignments that override the global TipEffortMap for this cell */
  tipEffortMap?: TipEffortMap;
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
}

/**
 * Grid configuration - stores all 64 positions (8x8 grid)
 */
export interface GridConfig {
  cells: GridCell[];
  gridRows: number;
  gridCols: number;
}

export function generateCellId(row: number, col: number): string {
  return `cell-${row}-${col}`;
}

export function createCell(row: number, col: number): GridCell {
  return {
    id: generateCellId(row, col),
    row,
    col,
    layers: [],
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation",
  };
}

export function createInitialGrid(): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < MAX_GRID_SIZE; row++) {
    for (let col = 0; col < MAX_GRID_SIZE; col++) {
      cells.push(createCell(row, col));
    }
  }
  return cells;
}

function deepCloneCells(source: GridCell[]): GridCell[] {
  return structuredClone($state.snapshot(source)) as GridCell[];
}

function clampDimension(n: number): number {
  return Math.max(1, Math.min(MAX_GRID_SIZE, Math.round(n)));
}

const DEFAULT_GRID_ROWS = 2;
const DEFAULT_GRID_COLS = 2;

function createArrangeGridState() {
  // Services from module functions (stateless class ceremony retired)
  const playbackEngine = getArrangePlaybackEngine();

  const initialConfig = loadGrid();

  // Core reactive state
  let cells = $state<GridCell[]>(initialConfig.cells);
  let gridRows = $state(initialConfig.gridRows);
  let gridCols = $state(initialConfig.gridCols);
  let selectedCellId = $state<string | null>(null);
  let showSequencePicker = $state(false);
  let skipStartPlacement = $state(true);

  let clipboard = $state<{
    layers: {
      sequence: SequenceData;
      transformStack: AppliedTransform[];
    }[];
    mediaType: CellMediaType;
  } | null>(null);
  let transformingLayer = $state<{ cellId: string; layerIndex: number } | null>(
    null
  );

  // Reactive mirrors of playback engine state
  let isPlaying = $state(false);
  let currentStep = $state(0);
  let playbackBpm = $state(120);

  // Playback polling - only runs during active playback to avoid burning
  // a permanent RAF loop. With 16+ cells, each RAF callback triggers Svelte
  // effects → engine.update() → triggerRender(), so idle polling wastes
  // significant CPU and causes false frame drop warnings.
  let playbackPollId: number | null = null;
  function startPlaybackPolling() {
    if (playbackPollId !== null) return;
    function poll() {
      const _wasPlaying = isPlaying;
      isPlaying = playbackEngine.isPlaying;
      currentStep = playbackEngine.currentStep;
      playbackBpm = playbackEngine.bpm;

      if (isPlaying || playbackEngine.isStepAnimating) {
        // Keep polling while playing or during step animation
        playbackPollId = requestAnimationFrame(poll);
      } else {
        // Playback stopped and no step animation - stop polling
        playbackPollId = null;
      }
    }
    playbackPollId = requestAnimationFrame(poll);
  }

  // =========================================================================
  // Undo / Redo
  // =========================================================================

  const undoManager = getArrangeUndoManager();
  undoManager.init(() => ({ cells: deepCloneCells(cells) }));

  let canUndo = $state(false);
  let canRedo = $state(false);
  let undoDescription = $state<string | null>(null);
  let redoDescription = $state<string | null>(null);

  undoManager.subscribe(() => {
    canUndo = undoManager.canUndo;
    canRedo = undoManager.canRedo;
    undoDescription = undoManager.undoDescription;
    redoDescription = undoManager.redoDescription;
  });

  migrateLocalStorageCompositions();

  function withUndo(
    type: ArrangeUndoOperationType,
    description: string,
    fn: () => void
  ): void {
    undoManager.captureState(type, description);
    try {
      fn();
      undoManager.commitState();
    } catch (err) {
      undoManager.cancelPending();
      throw err;
    }
  }

  function withCoalescingUndo(
    type: ArrangeUndoOperationType,
    description: string,
    coalescingKey: string,
    fn: () => void
  ): void {
    undoManager.captureState(type, description);
    try {
      fn();
      undoManager.commitStateCoalescing(coalescingKey);
    } catch (err) {
      undoManager.cancelPending();
      throw err;
    }
  }

  function restoreSnapshot(snapshot: ArrangeGridSnapshot): void {
    cells = snapshot.cells;
    save();
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  function save() {
    saveGrid({ cells, gridRows, gridCols });
  }

  function getCellAt(row: number, col: number): GridCell | undefined {
    return cells.find((c) => c.row === row && c.col === col);
  }

  function getCellIndex(row: number, col: number): number {
    return row * MAX_GRID_SIZE + col;
  }

  function computeOccupiedPositions(): Map<string, string> {
    const occupied = new Map<string, string>();
    for (const cell of cells.filter(
      (c) => c.row < gridRows && c.col < gridCols
    )) {
      for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
        for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
          if (r === cell.row && c === cell.col) continue;
          occupied.set(`${r}-${c}`, cell.id);
        }
      }
    }
    return occupied;
  }

  function getTotalBeats(): number {
    return calculateTotalBeats(cells, skipStartPlacement, gridRows, gridCols);
  }

  function applySpanningPreset(
    preset:
      | "hero-thumbs"
      | "main-banner"
      | "pip"
      | "split-half"
      | "quad"
      | "gallery"
  ): void {
    const newCells = cells.map((cell) => ({
      ...cell,
      colSpan: 1,
      rowSpan: 1,
      layers: [] as TunnelLayerConfig[],
    }));

    switch (preset) {
      case "hero-thumbs": {
        gridRows = 6;
        gridCols = 5;
        const heroCell = newCells[getCellIndex(0, 0)];
        if (heroCell)
          newCells[getCellIndex(0, 0)] = {
            ...heroCell,
            colSpan: 5,
            rowSpan: 5,
          };
        break;
      }
      case "main-banner": {
        gridRows = 6;
        gridCols = 6;
        const mainCell = newCells[getCellIndex(0, 0)];
        if (mainCell)
          newCells[getCellIndex(0, 0)] = {
            ...mainCell,
            colSpan: 6,
            rowSpan: 5,
          };
        break;
      }
      case "pip": {
        gridRows = 6;
        gridCols = 6;
        const mainCell = newCells[getCellIndex(0, 0)];
        if (mainCell)
          newCells[getCellIndex(0, 0)] = {
            ...mainCell,
            colSpan: 5,
            rowSpan: 6,
          };
        break;
      }
      case "split-half": {
        gridRows = 4;
        gridCols = 2;
        const leftCell = newCells[getCellIndex(0, 0)];
        if (leftCell)
          newCells[getCellIndex(0, 0)] = {
            ...leftCell,
            colSpan: 1,
            rowSpan: 4,
          };
        const rightCell = newCells[getCellIndex(0, 1)];
        if (rightCell)
          newCells[getCellIndex(0, 1)] = {
            ...rightCell,
            colSpan: 1,
            rowSpan: 4,
          };
        break;
      }
      case "quad": {
        gridRows = 6;
        gridCols = 6;
        const tl = newCells[getCellIndex(0, 0)];
        if (tl)
          newCells[getCellIndex(0, 0)] = { ...tl, colSpan: 3, rowSpan: 3 };
        const tr = newCells[getCellIndex(0, 3)];
        if (tr)
          newCells[getCellIndex(0, 3)] = { ...tr, colSpan: 3, rowSpan: 3 };
        const bl = newCells[getCellIndex(3, 0)];
        if (bl)
          newCells[getCellIndex(3, 0)] = { ...bl, colSpan: 3, rowSpan: 3 };
        const br = newCells[getCellIndex(3, 3)];
        if (br)
          newCells[getCellIndex(3, 3)] = { ...br, colSpan: 3, rowSpan: 3 };
        break;
      }
      case "gallery": {
        gridRows = 3;
        gridCols = 3;
        break;
      }
    }

    cells = newCells;
    selectedCellId = null;
    save();
  }

  return {
    get cells() {
      return cells;
    },
    get gridRows() {
      return gridRows;
    },
    get gridCols() {
      return gridCols;
    },
    get isPlaying() {
      return isPlaying;
    },
    get currentStep() {
      return currentStep;
    },
    get selectedCellId() {
      return selectedCellId;
    },
    get showSequencePicker() {
      return showSequencePicker;
    },
    get clipboard() {
      return clipboard;
    },
    get transformingLayer() {
      return transformingLayer;
    },
    get canUndo() {
      return canUndo;
    },
    get canRedo() {
      return canRedo;
    },
    get undoDescription() {
      return undoDescription;
    },
    get redoDescription() {
      return redoDescription;
    },

    get visibleCells() {
      return cells.filter((c) => c.row < gridRows && c.col < gridCols);
    },
    get totalSteps() {
      return getTotalBeats();
    },
    get skipStartPlacement() {
      return skipStartPlacement;
    },
    get hasAnyLayers() {
      return cells.some(
        (c) => c.row < gridRows && c.col < gridCols && c.layers.length > 0
      );
    },
    get selectedCell() {
      if (selectedCellId === null) return null;
      return cells.find((c) => c.id === selectedCellId) ?? null;
    },
    get selectedCellIndex() {
      if (selectedCellId === null) return null;
      const idx = cells.findIndex((c) => c.id === selectedCellId);
      return idx >= 0 ? idx : null;
    },

    getCellDisplayIndex(cellId: string): number {
      const visible = cells.filter((c) => c.row < gridRows && c.col < gridCols);
      const sorted = [...visible].sort((a, b) =>
        a.row !== b.row ? a.row - b.row : a.col - b.col
      );
      return sorted.findIndex((c) => c.id === cellId) + 1;
    },

    get occupiedPositions(): Map<string, string> {
      return computeOccupiedPositions();
    },

    get gridBounds() {
      return {
        minRow: 0,
        maxRow: gridRows - 1,
        minCol: 0,
        maxCol: gridCols - 1,
        rows: gridRows,
        cols: gridCols,
      };
    },

    get rows() {
      return gridRows;
    },
    get cols() {
      return gridCols;
    },

    // Grid dimension setters
    setGridRows(n: number) {
      const clamped = clampDimension(n);
      if (clamped === gridRows) return;
      withUndo(
        "SET_GRID_ROWS" as ArrangeUndoOperationType,
        `Set rows to ${clamped}`,
        () => {
          gridRows = clamped;
          cells = cells.map((cell) =>
            cell.row + cell.rowSpan > clamped
              ? { ...cell, rowSpan: Math.max(1, clamped - cell.row) }
              : cell
          );
          if (selectedCellId) {
            const cell = cells.find((c) => c.id === selectedCellId);
            if (cell && cell.row >= gridRows) selectedCellId = null;
          }
          save();
        }
      );
    },

    setGridCols(n: number) {
      const clamped = clampDimension(n);
      if (clamped === gridCols) return;
      withUndo(
        "SET_GRID_COLS" as ArrangeUndoOperationType,
        `Set columns to ${clamped}`,
        () => {
          gridCols = clamped;
          cells = cells.map((cell) =>
            cell.col + cell.colSpan > clamped
              ? { ...cell, colSpan: Math.max(1, clamped - cell.col) }
              : cell
          );
          if (selectedCellId) {
            const cell = cells.find((c) => c.id === selectedCellId);
            if (cell && cell.col >= gridCols) selectedCellId = null;
          }
          save();
        }
      );
    },

    setGridDimensions(rows: number, cols: number) {
      const clampedRows = clampDimension(rows);
      const clampedCols = clampDimension(cols);
      if (clampedRows === gridRows && clampedCols === gridCols) return;
      withUndo(
        "SET_PRESET_LAYOUT" as ArrangeUndoOperationType,
        `Set grid to ${clampedRows}x${clampedCols}`,
        () => {
          gridRows = clampedRows;
          gridCols = clampedCols;
          cells = cells.map((cell) => {
            let { colSpan, rowSpan } = cell;
            if (cell.col + colSpan > clampedCols)
              colSpan = Math.max(1, clampedCols - cell.col);
            if (cell.row + rowSpan > clampedRows)
              rowSpan = Math.max(1, clampedRows - cell.row);
            return colSpan !== cell.colSpan || rowSpan !== cell.rowSpan
              ? { ...cell, colSpan, rowSpan }
              : cell;
          });
          if (selectedCellId) {
            const cell = cells.find((c) => c.id === selectedCellId);
            if (cell && (cell.row >= gridRows || cell.col >= gridCols))
              selectedCellId = null;
          }
          save();
        }
      );
    },

    getOccupyingCell(row: number, col: number): string | null {
      return computeOccupiedPositions().get(`${row}-${col}`) ?? null;
    },

    setCellSpan(
      cellId: string,
      colSpan: number,
      rowSpan: number,
      newCol?: number,
      newRow?: number
    ): boolean {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return false;

      colSpan = Math.max(1, Math.min(colSpan, gridCols));
      rowSpan = Math.max(1, Math.min(rowSpan, gridRows));

      const targetCol =
        newCol !== undefined
          ? Math.max(0, Math.min(newCol, gridCols - 1))
          : cell.col;
      const targetRow =
        newRow !== undefined
          ? Math.max(0, Math.min(newRow, gridRows - 1))
          : cell.row;

      if (targetCol + colSpan > gridCols) return false;
      if (targetRow + rowSpan > gridRows) return false;

      const isMoving = targetCol !== cell.col || targetRow !== cell.row;

      withUndo("SET_CELL_SPAN", `Resize cell to ${colSpan}x${rowSpan}`, () => {
        const newCells = [...cells];

        if (isMoving) {
          const newOriginIdx = getCellIndex(targetRow, targetCol);
          const oldOriginIdx = cellIndex;
          const newOriginCell = newCells[newOriginIdx];

          if (newOriginCell) {
            newCells[newOriginIdx] = {
              ...cell,
              id: newOriginCell.id,
              row: newOriginCell.row,
              col: newOriginCell.col,
              colSpan,
              rowSpan,
            };
          }
          if (oldOriginIdx !== newOriginIdx) {
            newCells[oldOriginIdx] = createCell(cell.row, cell.col);
          }
          for (let r = targetRow; r < targetRow + rowSpan; r++) {
            for (let c = targetCol; c < targetCol + colSpan; c++) {
              const idx = getCellIndex(r, c);
              if (idx === newOriginIdx || idx === oldOriginIdx) continue;
              const t = newCells[idx];
              if (t && t.layers.length > 0)
                newCells[idx] = { ...t, layers: [], colSpan: 1, rowSpan: 1 };
            }
          }
          if (selectedCellId === cellId)
            selectedCellId = newOriginCell?.id ?? null;
        } else {
          for (let r = cell.row; r < cell.row + rowSpan; r++) {
            for (let c = cell.col; c < cell.col + colSpan; c++) {
              if (r === cell.row && c === cell.col) continue;
              const idx = getCellIndex(r, c);
              const t = newCells[idx];
              if (t && t.layers.length > 0)
                newCells[idx] = { ...t, layers: [], colSpan: 1, rowSpan: 1 };
            }
          }
          newCells[cellIndex] = { ...cell, colSpan, rowSpan };
        }

        cells = newCells;
        save();
      });

      return true;
    },

    resetCellSpan(cellId: string) {
      this.setCellSpan(cellId, 1, 1);
    },

    setPresetLayout(
      preset:
        | "single"
        | "vertical"
        | "horizontal"
        | "line"
        | "square"
        | "filmstrip"
        | "tower"
        | "hero-thumbs"
        | "main-banner"
        | "pip"
        | "split-half"
        | "quad"
        | "gallery"
    ) {
      withUndo("SET_PRESET_LAYOUT", `Set layout: ${preset}`, () => {
        if (
          preset === "hero-thumbs" ||
          preset === "main-banner" ||
          preset === "pip" ||
          preset === "split-half" ||
          preset === "quad" ||
          preset === "gallery"
        ) {
          applySpanningPreset(preset);
          return;
        }
        switch (preset) {
          case "single":
            gridRows = 1;
            gridCols = 1;
            break;
          case "vertical":
            gridRows = 2;
            gridCols = 1;
            break;
          case "horizontal":
            gridRows = 1;
            gridCols = 2;
            break;
          case "line":
            gridRows = 1;
            gridCols = 6;
            break;
          case "square":
            gridRows = 2;
            gridCols = 2;
            break;
          case "filmstrip":
            gridRows = 1;
            gridCols = 4;
            break;
          case "tower":
            gridRows = 4;
            gridCols = 1;
            break;
        }
        cells = cells.map((cell) => ({ ...cell, colSpan: 1, rowSpan: 1 }));
        selectedCellId = null;
        save();
      });
    },

    setSpanningPreset(
      preset:
        | "hero-thumbs"
        | "main-banner"
        | "pip"
        | "split-half"
        | "quad"
        | "gallery"
    ) {
      withUndo("SET_PRESET_LAYOUT", `Set layout: ${preset}`, () => {
        applySpanningPreset(preset);
      });
    },

    selectCell(cellId: string) {
      const cell = cells.find((c) => c.id === cellId);
      if (cell && cell.row < gridRows && cell.col < gridCols)
        selectedCellId = cellId;
    },

    selectCellAt(row: number, col: number) {
      const cell = getCellAt(row, col);
      if (cell && cell.row < gridRows && cell.col < gridCols)
        selectedCellId = cell.id;
    },

    deselectCell() {
      selectedCellId = null;
    },

    getRequiredBeatCount(): number | null {
      for (const cell of cells) {
        const firstLayer = cell.layers[0];
        if (cell.row < gridRows && cell.col < gridCols && firstLayer) {
          return firstLayer.sequence.steps?.length ?? null;
        }
      }
      return null;
    },

    // Layer operations
    addLayerToCell(
      cellId: string,
      sequence: SequenceData
    ): { success: boolean; error?: string } {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell || cell.layers.length >= MAX_LAYERS_PER_CELL) {
        return {
          success: false,
          error: "Cannot add layer - cell full or invalid",
        };
      }

      const requiredBeats = this.getRequiredBeatCount();
      const sequenceBeats = sequence.steps?.length ?? 0;
      if (requiredBeats !== null && sequenceBeats !== requiredBeats) {
        return {
          success: false,
          error: `Sequence has ${sequenceBeats} beats but composition requires ${requiredBeats} beats. All sequences must be the same length.`,
        };
      }

      const word = sequence.word || sequence.name || "sequence";
      withUndo("ADD_LAYER", `Add ${word}`, () => {
        const newLayer: TunnelLayerConfig = {
          sequence,
          beatOffset: 0,
          propColors: getTunnelLayerColors(cell.layers.length),
          transformStack: [],
        };
        const newCells = [...cells];
        newCells[cellIndex] = { ...cell, layers: [...cell.layers, newLayer] };
        cells = newCells;
        save();
      });
      return { success: true };
    },

    removeLayerFromCell(cellId: string, layerIndex: number) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell || layerIndex < 0 || layerIndex >= cell.layers.length) return;

      const layer = cell.layers[layerIndex];
      const word = layer?.sequence.word || layer?.sequence.name || "layer";
      withUndo("REMOVE_LAYER", `Remove ${word}`, () => {
        const newLayers = cell.layers
          .filter((_, i) => i !== layerIndex)
          .map((l, i) => ({ ...l, propColors: getTunnelLayerColors(i) }));
        const newCells = [...cells];
        newCells[cellIndex] = { ...cell, layers: newLayers };
        cells = newCells;
        save();
      });
    },

    updateLayerBeatOffset(cellId: string, layerIndex: number, offset: number) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell || layerIndex < 0 || layerIndex >= cell.layers.length) return;
      const existingLayer = cell.layers[layerIndex];
      if (!existingLayer) return;

      withCoalescingUndo(
        "UPDATE_LAYER_OFFSET",
        `Change layer offset to ${offset}`,
        `layer-offset-${cellId}-${layerIndex}`,
        () => {
          const newLayers = [...cell.layers];
          newLayers[layerIndex] = {
            ...existingLayer,
            beatOffset: Math.max(0, offset),
          };
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, layers: newLayers };
          cells = newCells;
          save();
        }
      );
    },

    updateCellBeatOffset(cellId: string, offset: number) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;

      withCoalescingUndo(
        "UPDATE_CELL_OFFSET",
        `Change cell offset to ${offset}`,
        `cell-offset-${cellId}`,
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, beatOffset: Math.max(0, offset) };
          cells = newCells;
          save();
        }
      );
    },

    clearCell(cellId: string) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo("CLEAR_CELL", `Clear cell (${cell.row},${cell.col})`, () => {
        const newCells = [...cells];
        newCells[cellIndex] = { ...cell, layers: [], beatOffset: 0 };
        cells = newCells;
        save();
      });
    },

    setCellMediaType(cellId: string, mediaType: CellMediaType) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo("SET_MEDIA_TYPE", `Set display to ${mediaType}`, () => {
        const newCells = [...cells];
        newCells[cellIndex] = { ...cell, mediaType };
        cells = newCells;
        save();
      });
    },

    // Per-cell overrides
    setCellSpeed(cellId: string, speed: number) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withCoalescingUndo(
        "SET_CELL_SPEED" as ArrangeUndoOperationType,
        `Set speed to ${speed}x`,
        `speed-${cellId}`,
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = {
            ...cell,
            speedMultiplier: Math.max(0.25, Math.min(2.0, speed)),
          };
          cells = newCells;
          save();
        }
      );
    },

    setCellEffect(cellId: string, effect: CellEffect) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo(
        "SET_CELL_EFFECT" as ArrangeUndoOperationType,
        `Set effect to ${effect}`,
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, effect };
          cells = newCells;
          save();
        }
      );
    },

    setCellTrailMode(cellId: string, mode: TrailMode) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo(
        "SET_CELL_TRAIL" as ArrangeUndoOperationType,
        `Set trail mode to ${mode}`,
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, trailMode: mode };
          cells = newCells;
          save();
        }
      );
    },

    setCellEffort(cellId: string, effort: string) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo(
        "SET_CELL_EFFORT" as ArrangeUndoOperationType,
        `Set effort to ${effort}`,
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, effort };
          cells = newCells;
          save();
        }
      );
    },

    setCellTipEffectMap(cellId: string, map: TipEffectMap) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo(
        "SET_TIP_EFFECT_MAP" as ArrangeUndoOperationType,
        "Update effects",
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, tipEffectMap: map };
          cells = newCells;
          save();
        }
      );
    },

    setCellTipEffortMap(cellId: string, map: TipEffortMap) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withUndo(
        "SET_TIP_EFFORT_MAP" as ArrangeUndoOperationType,
        "Update efforts",
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, tipEffortMap: map };
          cells = newCells;
          save();
        }
      );
    },

    setCellMotionVisibility(
      cellId: string,
      hand: "left" | "right",
      visible: boolean
    ) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      const label = `${visible ? "Show" : "Hide"} ${hand} motion`;
      withUndo("SET_CELL_VISIBILITY" as ArrangeUndoOperationType, label, () => {
        const newCells = [...cells];
        if (hand === "left") {
          newCells[cellIndex] = { ...cell, leftMotionVisible: visible };
        } else {
          newCells[cellIndex] = { ...cell, rightMotionVisible: visible };
        }
        cells = newCells;
        save();
      });
    },

    setCellBeatOffset(cellId: string, offset: number) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return;
      withCoalescingUndo(
        "SET_BEAT_OFFSET" as ArrangeUndoOperationType,
        `Set beat offset to ${offset}`,
        `offset-${cellId}`,
        () => {
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, beatOffset: Math.max(0, offset) };
          cells = newCells;
          save();
        }
      );
    },

    setCellPropColors(cellId: string, colors: PropColors) {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell || cell.layers.length === 0) return;
      withUndo(
        "SET_PROP_COLORS" as ArrangeUndoOperationType,
        `Change prop colors`,
        () => {
          const newLayers = cell.layers.map((l, i) =>
            i === 0 ? { ...l, propColors: colors } : l
          );
          const newCells = [...cells];
          newCells[cellIndex] = { ...cell, layers: newLayers };
          cells = newCells;
          save();
        }
      );
    },

    // Playback (delegated to ArrangePlaybackEngine)
    play() {
      if (
        !cells.some(
          (c) => c.row < gridRows && c.col < gridCols && c.layers.length > 0
        )
      )
        return;
      playbackEngine.play(getTotalBeats);
      startPlaybackPolling();
    },
    pause() {
      playbackEngine.pause();
      // Do one final poll to capture the paused state
      isPlaying = playbackEngine.isPlaying;
      currentStep = playbackEngine.currentStep;
    },
    stop() {
      playbackEngine.stop();
      // Do one final poll to capture the stopped state
      isPlaying = playbackEngine.isPlaying;
      currentStep = playbackEngine.currentStep;
    },

    togglePlayPause() {
      if (playbackEngine.isPlaying) {
        playbackEngine.pause();
        isPlaying = playbackEngine.isPlaying;
        currentStep = playbackEngine.currentStep;
      } else if (
        cells.some(
          (c) => c.row < gridRows && c.col < gridCols && c.layers.length > 0
        )
      ) {
        playbackEngine.play(getTotalBeats);
        startPlaybackPolling();
      }
    },

    stepFullForward() {
      playbackEngine.animateStep(1, getTotalBeats());
      startPlaybackPolling(); // Animated step needs polling to update currentStep
    },
    stepFullBack() {
      const floored = Math.floor(playbackEngine.currentStep);
      if (playbackEngine.currentStep - floored > 0.01) {
        playbackEngine.animateStep(
          floored - playbackEngine.currentStep,
          getTotalBeats()
        );
      } else {
        playbackEngine.animateStep(-1, getTotalBeats());
      }
      startPlaybackPolling();
    },
    stepHalfForward() {
      playbackEngine.animateStep(0.5, getTotalBeats());
      startPlaybackPolling();
    },
    stepHalfBack() {
      const snapped = Math.round(playbackEngine.currentStep * 2) / 2;
      const diff = snapped - playbackEngine.currentStep;
      if (Math.abs(diff) > 0.01 && diff < 0) {
        playbackEngine.animateStep(diff, getTotalBeats());
      } else {
        playbackEngine.animateStep(-0.5, getTotalBeats());
      }
      startPlaybackPolling();
    },

    toggleSkipStartPlacement() {
      skipStartPlacement = !skipStartPlacement;
      playbackEngine.setCurrentBeat(0);
    },

    get bpm() {
      return playbackBpm;
    },
    setBpm(bpm: number) {
      playbackEngine.setBpm(bpm);
    },

    // Clipboard
    copyLayerSequence(cellId: string, layerIndex: number) {
      const cell = cells.find((c) => c.id === cellId);
      const layer = cell?.layers[layerIndex];
      if (cell && layer) {
        clipboard = {
          layers: [
            {
              sequence: structuredClone(
                $state.snapshot(layer.sequence)
              ) as SequenceData,
              transformStack: [...(layer.transformStack ?? [])],
            },
          ],
          mediaType: cell.mediaType,
        };
      }
    },

    copyCellLayers(cellId: string) {
      const cell = cells.find((c) => c.id === cellId);
      if (cell && cell.layers.length > 0) {
        clipboard = {
          layers: cell.layers.map((layer) => ({
            sequence: structuredClone(
              $state.snapshot(layer.sequence)
            ) as SequenceData,
            transformStack: [...(layer.transformStack ?? [])],
          })),
          mediaType: cell.mediaType,
        };
      }
    },

    pasteSequenceToCell(cellId: string): {
      success: boolean;
      error?: string;
      pastedCount?: number;
    } {
      if (!clipboard) return { success: false, error: "Nothing copied" };

      const cellIndex = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIndex];
      if (!cell) return { success: false, error: "Invalid cell" };

      const availableSlots = MAX_LAYERS_PER_CELL - cell.layers.length;
      if (availableSlots <= 0)
        return { success: false, error: "Cell is full (max 4 layers)" };

      const layersToPaste = clipboard.layers.slice(0, availableSlots);

      const requiredBeats = this.getRequiredBeatCount();
      if (requiredBeats !== null) {
        for (const clipLayer of layersToPaste) {
          const sequenceBeats = clipLayer.sequence.steps?.length ?? 0;
          if (sequenceBeats !== requiredBeats) {
            return {
              success: false,
              error: `Sequence has ${sequenceBeats} beats but composition requires ${requiredBeats} beats. All sequences must be the same length.`,
            };
          }
        }
      }

      const count = layersToPaste.length;
      const firstLayer = layersToPaste[0]!;
      const label =
        count === 1
          ? `Paste ${firstLayer.sequence.word || firstLayer.sequence.name || "sequence"}`
          : `Paste ${count} sequences`;

      withUndo("PASTE_SEQUENCE", label, () => {
        const newLayers: TunnelLayerConfig[] = layersToPaste.map(
          (clipLayer, i) => ({
            sequence: structuredClone(
              $state.snapshot(clipLayer.sequence)
            ) as SequenceData,
            beatOffset: 0,
            propColors: getTunnelLayerColors(cell.layers.length + i),
            transformStack: [...(clipLayer.transformStack ?? [])],
          })
        );
        const newCells = [...cells];
        newCells[cellIndex] = {
          ...cell,
          layers: [...cell.layers, ...newLayers],
          mediaType: clipboard!.mediaType,
        };
        cells = newCells;
        save();
      });
      return { success: true, pastedCount: count };
    },

    // Transform (delegated to ArrangeLayerTransformer)
    async transformLayer(
      cellId: string,
      layerIndex: number,
      transformType: TransformType
    ): Promise<{ success: boolean; error?: string }> {
      const cellIdx = cells.findIndex((c) => c.id === cellId);
      const cell = cells[cellIdx];
      const layer = cell?.layers[layerIndex];
      if (!cell || !layer)
        return { success: false, error: "Invalid cell or layer" };

      const sequenceSnapshot = $state.snapshot(layer.sequence) as SequenceData;
      const layerSnapshot = $state.snapshot(layer) as TunnelLayerConfig;
      const cellSnapshot = $state.snapshot(cell) as GridCell;

      undoManager.captureState(
        "TRANSFORM_LAYER",
        `Transform: ${transformType}`
      );
      transformingLayer = { cellId, layerIndex };

      try {
        const result = await applyTransform(sequenceSnapshot, transformType);
        if (!result.success || !result.transformed) {
          undoManager.cancelPending();
          return { success: false, error: result.error ?? "Transform failed" };
        }

        const newLayers = [...cellSnapshot.layers];
        const prevStack = layerSnapshot.transformStack ?? [];
        const newTransform: AppliedTransform = {
          type: transformType,
          hand: "both",
          timestamp: Date.now(),
        };
        newLayers[layerIndex] = {
          ...layerSnapshot,
          sequence: result.transformed,
          transformStack: [...prevStack, newTransform],
        };
        const newCells = [...($state.snapshot(cells) as GridCell[])];
        newCells[cellIdx] = { ...cellSnapshot, layers: newLayers };
        cells = newCells;
        save();

        undoManager.commitState();
        return { success: true };
      } catch (err) {
        console.error("Transform failed:", err);
        undoManager.cancelPending();
        return { success: false, error: "Transform failed" };
      } finally {
        transformingLayer = null;
      }
    },

    // UI
    openSequencePicker() {
      showSequencePicker = true;
    },
    closeSequencePicker() {
      showSequencePicker = false;
    },

    // =========================================================================
    // Serialize / Save / Load
    // =========================================================================

    suggestCompositionName(): string {
      const visible = cells.filter((c) => c.row < gridRows && c.col < gridCols);
      const populatedCount = visible.filter((c) => c.layers.length > 0).length;
      const words = new Set<string>();
      for (const cell of visible) {
        for (const layer of cell.layers) {
          const word = layer.sequence.intendedWord || layer.sequence.word;
          if (word) words.add(word.length > 12 ? word.slice(0, 12) : word);
        }
      }

      const layoutDesc = `${gridCols}x${gridRows}`;

      if (words.size === 0) return `${layoutDesc} Composition`;
      if (words.size === 1) {
        const word = [...words][0]!;
        if (populatedCount === 1) return word;
        return `${word} ${layoutDesc}`;
      }
      const wordList = [...words].slice(0, 3).join(", ");
      const suffix = words.size > 3 ? " +" : "";
      return `${wordList}${suffix} (${layoutDesc})`;
    },

    serializeState(): string {
      return serializeGrid({
        cells: this.visibleCells.filter((c) => c.layers.length > 0),
        bpm: playbackBpm,
        skipStartPlacement,
        gridRows,
        gridCols,
      });
    },

    async saveComposition(name: string): Promise<string> {
      const id = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const snapshot = $state.snapshot(cells) as GridCell[];
      const composition = gridCellsToComposition(id, name, {
        cells: snapshot,
        gridRows,
        gridCols,
        bpm: playbackBpm,
        skipStartPlacement,
      });
      await compositionSyncer.saveComposition(composition);
      return id;
    },

    async loadComposition(id: string): Promise<boolean> {
      const composition = await dexieGetComposition(id);
      if (!composition) return false;

      const restored = compositionToGridState(composition);
      withUndo("LOAD_COMPOSITION", `Load: ${composition.name}`, () => {
        cells = restored.cells;
        gridRows = restored.gridRows;
        gridCols = restored.gridCols;
        playbackEngine.setBpm(restored.bpm);
        skipStartPlacement = restored.skipStartPlacement;
        selectedCellId = null;
        playbackEngine.stop();
        save();
      });
      return true;
    },

    async getSavedCompositions(): Promise<Composition[]> {
      return compositionSyncer.getCompositions();
    },

    async deleteSavedComposition(id: string): Promise<void> {
      await compositionSyncer.deleteComposition(id);
    },

    reset() {
      withUndo("RESET", "Reset grid", () => {
        playbackEngine.stop();
        cells = createInitialGrid();
        gridRows = DEFAULT_GRID_ROWS;
        gridCols = DEFAULT_GRID_COLS;
        selectedCellId = null;
        showSequencePicker = false;
        save();
      });
    },

    undo(): string | null {
      const result = undoManager.undo();
      if (!result) return null;
      restoreSnapshot(result.snapshot);
      return result.description;
    },

    redo(): string | null {
      const result = undoManager.redo();
      if (!result) return null;
      restoreSnapshot(result.snapshot);
      return result.description;
    },

    clearUndoHistory() {
      undoManager.clear();
    },
  };
}

let _instance: ReturnType<typeof createArrangeGridState> | null = null;

function getArrangeGridState() {
  if (!_instance) {
    _instance = createArrangeGridState();
  }
  return _instance;
}

export const arrangeGridState = new Proxy(
  {} as ReturnType<typeof createArrangeGridState>,
  {
    get(_target, prop) {
      return (getArrangeGridState() as Record<string | symbol, unknown>)[prop];
    },
  }
);
export type ArrangeGridState = ReturnType<typeof createArrangeGridState>;

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
