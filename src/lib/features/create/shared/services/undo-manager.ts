/**
 * Undo/Redo Service Implementation
 *
 * Professional undo/redo management using Command Pattern with persistent storage.
 * Handles complex async operations and provides a clean API for Create module operations.
 *
 * Uses Svelte 5 runes for reactive state management.
 */

import { browser } from "$app/environment";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ActiveCreateModule } from "$lib/shared/foundation/ui/ui-types";
import { normalizeLegacySequence } from "@tka/tka-types";

/**
 * Types of undoable operations in the Create module
 */
export enum UndoOperationType {
  // Sequence construction operations
  SELECT_START_PLACEMENT = "SELECT_START_PLACEMENT",
  ADD_BEAT = "ADD_BEAT",
  REMOVE_BEATS = "REMOVE_BEATS",
  CLEAR_SEQUENCE = "CLEAR_SEQUENCE",

  // Beat modification operations
  UPDATE_BEAT = "UPDATE_BEAT",
  INSERT_BEAT = "INSERT_BEAT",
  BATCH_EDIT = "BATCH_EDIT",

  // Transform operations
  MIRROR_SEQUENCE = "MIRROR_SEQUENCE",
  FLIP_SEQUENCE = "FLIP_SEQUENCE",
  ROTATE_SEQUENCE = "ROTATE_SEQUENCE",
  SWAP_HANDS = "SWAP_HANDS",
  INVERT_SEQUENCE = "INVERT_SEQUENCE",
  REWIND_SEQUENCE = "REWIND_SEQUENCE",
  SHIFT_START = "SHIFT_START",

  // Pattern operations
  APPLY_TURN_PATTERN = "APPLY_TURN_PATTERN",
  APPLY_ROTATION_PATTERN = "APPLY_ROTATION_PATTERN",
  APPLY_DURATION_PATTERN = "APPLY_DURATION_PATTERN",
  EXTEND_SEQUENCE = "EXTEND_SEQUENCE",

  // Edit operations
  MODIFY_BEAT_PROPERTIES = "MODIFY_BEAT_PROPERTIES",

  // Generate operations
  GENERATE_SEQUENCE = "GENERATE_SEQUENCE",

  // Spell module operations
  SPELL_GENERATE = "SPELL_GENERATE",
  SPELL_APPLY_LOOP = "SPELL_APPLY_LOOP",
}

/**
 * Metadata for undo history entries
 */
export interface UndoMetadata {
  stepIndex?: number;
  stepsRemoved?: number;
  description?: string;
  [key: string]: unknown;
}

/**
 * Snapshot of Create Module State at a specific point in time
 */
export interface CreateModuleStateSnapshot {
  sequence: SequenceData | null;
  selectedStepNumber: number | null;
  activeSection: ActiveCreateModule | null;
  shouldShowStartPlacementPicker?: boolean;
  timestamp: number;
}

/**
 * A single undoable action in the history
 */
export interface UndoHistoryEntry {
  id: string;
  type: UndoOperationType;
  timestamp: number;
  beforeState: CreateModuleStateSnapshot;
  afterState?: CreateModuleStateSnapshot;
  metadata?: UndoMetadata;
}

/**
 * Default maximum number of undo entries to keep
 */
const DEFAULT_MAX_HISTORY_SIZE = 50;

/**
 * LocalStorage key for persisting undo history
 */
const UNDO_HISTORY_STORAGE_KEY = "tka_build_undo_history";

/**
 * LocalStorage key for persisting redo history
 */
const REDO_HISTORY_STORAGE_KEY = "tka_build_redo_history";

export function normalizeUndoHistoryEntries(
  value: unknown
): UndoHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    ...entry,
    beforeState: {
      ...entry.beforeState,
      sequence: entry.beforeState?.sequence
        ? normalizeLegacySequence(entry.beforeState.sequence)
        : null,
    },
    ...(entry.afterState && {
      afterState: {
        ...entry.afterState,
        sequence: entry.afterState.sequence
          ? normalizeLegacySequence(entry.afterState.sequence)
          : null,
      },
    }),
  })) as UndoHistoryEntry[];
}

/**
 * Human-readable descriptions for operation types
 */
const OPERATION_DESCRIPTIONS: Record<UndoOperationType, string> = {
  SELECT_START_PLACEMENT: "Select Start Placement",
  ADD_BEAT: "Add Beat",
  REMOVE_BEATS: "Remove Steps",
  CLEAR_SEQUENCE: "Clear Sequence",
  UPDATE_BEAT: "Update Beat",
  INSERT_BEAT: "Insert Beat",
  BATCH_EDIT: "Batch Edit",
  MIRROR_SEQUENCE: "Mirror",
  FLIP_SEQUENCE: "Flip",
  ROTATE_SEQUENCE: "Rotate",
  SWAP_HANDS: "Swap Hands",
  INVERT_SEQUENCE: "Invert",
  REWIND_SEQUENCE: "Rewind",
  SHIFT_START: "Shift Start",
  APPLY_TURN_PATTERN: "Apply Turn Pattern",
  APPLY_ROTATION_PATTERN: "Apply Rotation Pattern",
  APPLY_DURATION_PATTERN: "Apply Duration Pattern",
  EXTEND_SEQUENCE: "Extend",
  MODIFY_BEAT_PROPERTIES: "Modify Beat Properties",
  GENERATE_SEQUENCE: "Generate Sequence",
  SPELL_GENERATE: "Spell Generate",
  SPELL_APPLY_LOOP: "Spell Apply LOOP",
};

export class UndoManager {
  // Pure TypeScript arrays - reactivity handled by wrapper
  private _undoHistory: UndoHistoryEntry[] = [];
  private _redoHistory: UndoHistoryEntry[] = [];
  private _maxHistorySize: number = DEFAULT_MAX_HISTORY_SIZE;
  private _changeCallbacks: Set<() => void> = new Set();

  constructor() {
    // Load persisted history
    void this.loadHistory();
  }

  /**
   * Subscribe to changes in undo/redo state
   */
  onChange(callback: () => void): () => void {
    this._changeCallbacks.add(callback);
    // Return unsubscribe function
    return () => this._changeCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers of state change
   */
  private notifyChange(): void {
    this._changeCallbacks.forEach((callback) => callback());
  }

  get maxHistorySize(): number {
    return this._maxHistorySize;
  }

  get canUndo(): boolean {
    return this._undoHistory.length > 0;
  }

  get canRedo(): boolean {
    return this._redoHistory.length > 0;
  }

  get undoHistory(): ReadonlyArray<UndoHistoryEntry> {
    return this._undoHistory;
  }

  get redoHistory(): ReadonlyArray<UndoHistoryEntry> {
    return this._redoHistory;
  }

  /**
   * Push a new action to the undo history
   */
  pushUndo(
    type: UndoOperationType,
    beforeState: CreateModuleStateSnapshot,
    metadata?: UndoMetadata
  ): string {
    // Generate unique ID for this action
    const id = this.generateActionId();

    const entry: UndoHistoryEntry = {
      id,
      type,
      timestamp: Date.now(),
      beforeState,
      metadata: metadata ?? { description: "" },
    };

    this._undoHistory.push(entry);

    // Trim history if it exceeds max size
    if (this._undoHistory.length > this._maxHistorySize) {
      this._undoHistory.shift();
    }

    // A new edit replaces the future for its own workspace. Other Create tabs
    // keep separate sequence states, so their pending redo actions remain valid.
    this._redoHistory = beforeState.activeSection
      ? this._redoHistory.filter(
          (entry) =>
            entry.beforeState.activeSection !== beforeState.activeSection
        )
      : [];

    // Persist to storage
    this.saveHistory().catch((error) => {
      console.error(
        "❌ UndoManager: Failed to save history after push:",
        error
      );
    });

    // Notify subscribers of change
    this.notifyChange();

    return id;
  }

  /**
   * Undo the last operation.
   * If activeSection is provided, only undoes entries from that tab.
   */
  undo(
    activeSection?: string | null,
    afterState?: CreateModuleStateSnapshot
  ): UndoHistoryEntry | null {
    if (!this.canUndo) {
      return null;
    }

    if (activeSection) {
      // Find the most recent entry belonging to this tab
      let targetIndex = -1;
      for (let i = this._undoHistory.length - 1; i >= 0; i--) {
        if (this._undoHistory[i]!.beforeState.activeSection === activeSection) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) return null;

      // Remove from undo history and move to redo history
      const [entry] = this._undoHistory.splice(targetIndex, 1);
      if (!entry) return null;
      if (afterState) {
        entry.afterState = afterState;
      }
      this._redoHistory.push(entry);

      this.saveHistory().catch((error) => {
        console.error(
          "❌ UndoManager: Failed to save history after undo:",
          error
        );
      });
      this.notifyChange();
      return entry;
    }

    // No filter - pop the last entry (legacy behavior)
    const entry = this._undoHistory.pop();
    if (!entry) {
      return null;
    }

    if (afterState) {
      entry.afterState = afterState;
    }

    // Move to redo history
    this._redoHistory.push(entry);

    // Persist to storage
    this.saveHistory().catch((error) => {
      console.error(
        "❌ UndoManager: Failed to save history after undo:",
        error
      );
    });

    // Notify subscribers of change
    this.notifyChange();

    return entry;
  }

  /**
   * Check if there are undoable entries for a specific tab
   */
  canUndoForSection(activeSection: string): boolean {
    return this.getLastUndoEntry(activeSection) !== null;
  }

  /**
   * Check if there are redoable entries for a specific tab
   */
  canRedoForSection(activeSection: string): boolean {
    return this.getLastRedoEntry(activeSection) !== null;
  }

  /**
   * Redo the last undone operation
   */
  redo(activeSection?: string | null): UndoHistoryEntry | null {
    if (!this.canRedo) {
      return null;
    }

    let entry: UndoHistoryEntry | undefined;
    if (activeSection) {
      let targetIndex = -1;
      for (let i = this._redoHistory.length - 1; i >= 0; i--) {
        if (this._redoHistory[i]!.beforeState.activeSection === activeSection) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) return null;

      [entry] = this._redoHistory.splice(targetIndex, 1);
    } else {
      entry = this._redoHistory.pop();
    }

    if (!entry) {
      return null;
    }

    // Move back to undo history
    this._undoHistory.push(entry);

    // Persist to storage
    this.saveHistory().catch((error) => {
      console.error(
        "❌ UndoManager: Failed to save history after redo:",
        error
      );
    });

    // Notify subscribers of change
    this.notifyChange();

    return entry;
  }

  /**
   * Clear all undo and redo history
   */
  clearHistory(): void {
    this._undoHistory = [];
    this._redoHistory = [];

    // Persist to storage
    this.saveHistory().catch((error) => {
      console.error(
        "❌ UndoManager: Failed to save history after clear:",
        error
      );
    });

    // Notify subscribers of change
    this.notifyChange();
  }

  /**
   * Clear only redo history
   */
  clearRedoHistory(): void {
    this._redoHistory = [];

    // Persist to storage
    this.saveHistory().catch((error) => {
      console.error(
        "❌ UndoManager: Failed to save history after clearing redo:",
        error
      );
    });

    // Notify subscribers of change
    this.notifyChange();
  }

  /**
   * Get the entry that Undo would restore next.
   * If activeSection is provided, entries from other Create tabs are skipped.
   */
  getLastUndoEntry(activeSection?: string | null): UndoHistoryEntry | null {
    if (!this.canUndo) {
      return null;
    }

    if (!activeSection) {
      return this._undoHistory[this._undoHistory.length - 1] ?? null;
    }

    for (let i = this._undoHistory.length - 1; i >= 0; i--) {
      const entry = this._undoHistory[i];
      if (entry?.beforeState.activeSection === activeSection) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Get the entry that Redo would restore next.
   * If activeSection is provided, entries from other Create tabs are skipped.
   */
  getLastRedoEntry(activeSection?: string | null): UndoHistoryEntry | null {
    if (!this.canRedo) {
      return null;
    }

    if (!activeSection) {
      return this._redoHistory[this._redoHistory.length - 1] ?? null;
    }

    for (let i = this._redoHistory.length - 1; i >= 0; i--) {
      const entry = this._redoHistory[i];
      if (entry?.beforeState.activeSection === activeSection) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Get description of last undoable action.
   * If activeSection is provided, returns description of the last entry from that tab.
   */
  getLastUndoDescription(activeSection?: string | null): string | null {
    const lastEntry = this.getLastUndoEntry(activeSection);
    if (!lastEntry) {
      return null;
    }

    // Use custom description if provided
    if (lastEntry.metadata?.description) {
      return lastEntry.metadata.description;
    }

    // Fall back to operation type description
    return OPERATION_DESCRIPTIONS[lastEntry.type] || "Last Action";
  }

  getLastRedoDescription(activeSection?: string | null): string | null {
    const lastEntry = this.getLastRedoEntry(activeSection);
    if (!lastEntry) {
      return null;
    }

    // Use custom description if provided
    if (lastEntry.metadata?.description) {
      return lastEntry.metadata.description;
    }

    // Fall back to operation type description
    return OPERATION_DESCRIPTIONS[lastEntry.type] || "Last Action";
  }

  /**
   * Load history from persistent storage
   */
  async loadHistory(): Promise<void> {
    // Skip during SSR - no localStorage available
    if (!browser) {
      return;
    }

    try {
      const undoData = localStorage.getItem(UNDO_HISTORY_STORAGE_KEY);
      if (undoData) {
        this._undoHistory = normalizeUndoHistoryEntries(JSON.parse(undoData));
      }

      const redoData = localStorage.getItem(REDO_HISTORY_STORAGE_KEY);
      if (redoData) {
        this._redoHistory = normalizeUndoHistoryEntries(JSON.parse(redoData));
      }

      // Notify subscribers after loading
      this.notifyChange();
    } catch (error) {
      console.error(
        "❌ UndoManager: Failed to load history from storage:",
        error
      );
      // Reset to empty on error
      this._undoHistory = [];
      this._redoHistory = [];
      this.notifyChange();
    }
  }

  /**
   * Save history to persistent storage
   */
  async saveHistory(): Promise<void> {
    // Skip during SSR - no localStorage available
    if (!browser) {
      return;
    }

    try {
      localStorage.setItem(
        UNDO_HISTORY_STORAGE_KEY,
        JSON.stringify(this._undoHistory)
      );
      localStorage.setItem(
        REDO_HISTORY_STORAGE_KEY,
        JSON.stringify(this._redoHistory)
      );
    } catch (error) {
      console.error(
        "❌ UndoManager: Failed to save history to storage:",
        error
      );
      throw error;
    }
  }

  /**
   * Peek at the state that would be restored by undo
   */
  peekUndoState(): CreateModuleStateSnapshot | null {
    if (!this.canUndo) {
      return null;
    }

    const lastEntry = this._undoHistory[this._undoHistory.length - 1];
    return lastEntry ? lastEntry.beforeState : null;
  }

  /**
   * Peek at the state that would be restored by redo
   */
  peekRedoState(
    activeSection?: string | null
  ): CreateModuleStateSnapshot | null {
    // For redo, we want the "after" state, which is the current state when the action was performed
    const entry = this.getLastRedoEntry(activeSection);
    return entry ? entry.afterState || null : null;
  }

  /**
   * Generate a unique action ID
   */
  private generateActionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Jump to a specific history entry by ID
   * Moves all entries between current position and target to appropriate stack
   */
  jumpToState(targetId: string): UndoHistoryEntry | null {
    // First, check if target is in undo history
    const undoIndex = this._undoHistory.findIndex((e) => e.id === targetId);
    if (undoIndex !== -1) {
      // Target is in undo history - need to undo back to that point
      // Move all entries from undoIndex+1 to end to redo stack
      const entriesToMove = this._undoHistory.splice(undoIndex + 1);
      // Reverse so most recent is at end of redo stack
      this._redoHistory.push(...entriesToMove.reverse());

      this.saveHistory().catch((error) => {
        console.error(
          "❌ UndoManager: Failed to save history after jump:",
          error
        );
      });
      this.notifyChange();

      return this._undoHistory[undoIndex] ?? null;
    }

    // Check if target is in redo history
    const redoIndex = this._redoHistory.findIndex((e) => e.id === targetId);
    if (redoIndex !== -1) {
      // Target is in redo history - need to redo up to that point
      // Move all entries from redoIndex to end to undo stack
      const entriesToMove = this._redoHistory.splice(redoIndex);
      // Reverse so they go back in correct order
      this._undoHistory.push(...entriesToMove.reverse());

      this.saveHistory().catch((error) => {
        console.error(
          "❌ UndoManager: Failed to save history after jump:",
          error
        );
      });
      this.notifyChange();

      return this._undoHistory[this._undoHistory.length - 1] ?? null;
    }

    return null; // Entry not found
  }

  /**
   * Get combined timeline of undo and redo entries
   * Shows undo stack (oldest to newest), then redo stack (newest to oldest)
   */
  getTimeline(): Array<UndoHistoryEntry & { isInRedoStack: boolean }> {
    // Undo history is ordered oldest to newest - past actions
    const undoEntries = this._undoHistory.map((entry) => ({
      ...entry,
      isInRedoStack: false,
    }));

    // Redo history is ordered oldest (first undone) to newest (most recently undone)
    // We reverse it so the "future" appears in order from closest to farthest
    const redoEntries = [...this._redoHistory].reverse().map((entry) => ({
      ...entry,
      isInRedoStack: true,
    }));

    return [...undoEntries, ...redoEntries];
  }

  /**
   * Get description for an operation type
   */
  getOperationDescription(type: UndoOperationType): string {
    return OPERATION_DESCRIPTIONS[type] || "Unknown Action";
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const undoManager = new UndoManager();
