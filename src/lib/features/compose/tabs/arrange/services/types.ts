import type { GridCell } from "../state/arrange-grid-state.svelte";
import type { TransformType } from "$lib/shared/animation-engine/domain/compose-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * IArrangeUndoManager - Contract for Arrange tab undo/redo
 *
 * Captures grid cell snapshots before/after mutations using
 * the capture-before / commit-after pattern from TimelineUndoManager.
 * Session-only: undo history is NOT persisted to localStorage.
 */


/**
 * Types of undoable operations in the Arrange grid
 */
export type ArrangeUndoOperationType =
  | "SET_GRID_ROWS"
  | "SET_GRID_COLS"
  | "SET_PRESET_LAYOUT"
  | "SET_CELL_SPAN"
  | "ADD_LAYER"
  | "REMOVE_LAYER"
  | "UPDATE_LAYER_OFFSET"
  | "UPDATE_CELL_OFFSET"
  | "CLEAR_CELL"
  | "SET_MEDIA_TYPE"
  | "PASTE_SEQUENCE"
  | "TRANSFORM_LAYER"
  | "RESET"
  | "LOAD_COMPOSITION";

/**
 * Snapshot of the undoable portion of grid state.
 * Only cells are captured - selection and playback state are not undoable.
 */
export interface ArrangeGridSnapshot {
  cells: GridCell[];
}

/**
 * Result from undo/redo operations.
 * Bundles the snapshot with its description so callers don't need
 * to understand internal stack mechanics.
 */
export interface UndoResult {
  snapshot: ArrangeGridSnapshot;
  description: string;
}

/**
 * A single entry in the undo history
 */
export interface ArrangeUndoEntry {
  id: string;
  type: ArrangeUndoOperationType;
  timestamp: number;
  beforeState: ArrangeGridSnapshot;
  afterState?: ArrangeGridSnapshot;
  description: string;
  /** Key for coalescing rapid same-type operations (e.g. slider drags) */
  coalescingKey?: string;
}

/**
 * Undo manager interface for Arrange grid operations
 */

/**
 * IArrangeKeyboardHandler - Contract for arrange tab keyboard shortcuts
 *
 * Handles keyboard events for the grid composition builder:
 * - Arrow key navigation between cells
 * - Clipboard operations (Ctrl+C/V)
 * - Play/pause (Space)
 * - Delete/clear (Delete/Backspace)
 * - Escape to deselect
 * - Transform hotkeys (R/M/V/S/I, Shift+R) on selected cell layer 0
 */


/**
 * Snapshot of UI state needed to decide how to handle a keypress.
 * Passed in by the component so the handler stays UI-framework-agnostic.
 */
export interface KeyboardContext {
  /** Whether any modal/overlay is open (sequence picker, stagger, save) */
  isModalOpen: boolean;
  /** Whether the device is mobile (keyboard shortcuts disabled) */
  isMobile: boolean;
  /** Currently selected cell, if any */
  selectedCell: GridCell | null;
  /** ID of the currently selected cell */
  selectedCellId: string | null;
  /** Whether clipboard has data for pasting */
  hasClipboard: boolean;
  /** Whether any cell has layers (for play/pause gate) */
  hasAnyLayers: boolean;
}

/**
 * Callbacks the handler invokes in response to keyboard events.
 * The component provides these to wire keyboard actions to state mutations and toasts.
 */
export interface KeyboardCallbacks {
  clearCell(): void;
  deselectCell(): void;
  selectCell(cellId: string): void;
  playPause(): void;
  copyCell(): void;
  pasteLayer(): void;
  transformLayer(layerIndex: number, transformType: TransformType): void;
}

/**
 * IArrangeLayerTransformer - Contract for sequence transform operations
 *
 * Applies geometric transforms (rotate, mirror, flip, etc.) to a sequence
 * within an arrange grid layer. Each transform is async because the
 * underlying sequence transformer may need to recompute orientations.
 */


export interface TransformResult {
  success: boolean;
  transformed?: SequenceData;
  error?: string;
}

/**
 * IArrangeGridSerializer - Serializes grid state to a human-readable template format.
 *
 * Deduplicates sequences, foregrounds transforms, separates grid structure from content.
 * Used for clipboard export and debugging.
 */


export interface SerializationContext {
  cells: GridCell[];
  bpm: number;
  skipStartPlacement: boolean;
  gridRows: number;
  gridCols: number;
}

/**
 * IArrangeCompositionConverter
 *
 * Converts between the Arrange tab's GridCell[] format and the
 * Composition format used by Dexie persistence and the Browse tab.
 */


export interface GridStateSnapshot {
  cells: GridCell[];
  gridRows: number;
  gridCols: number;
  bpm: number;
  skipStartPlacement: boolean;
}
