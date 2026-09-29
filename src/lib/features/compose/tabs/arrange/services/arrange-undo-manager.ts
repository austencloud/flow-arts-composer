/**
 * ArrangeUndoManager - Undo/redo for Arrange grid mutations
 *
 * Session-only: history is NOT persisted to localStorage.
 * Grid state itself still persists via arrange-grid-state's save().
 */

import type { ArrangeUndoOperationType, ArrangeUndoEntry, ArrangeGridSnapshot, UndoResult } from "./types";

const MAX_HISTORY_SIZE = 50;
const DEFAULT_COALESCING_WINDOW_MS = 500;

export class ArrangeUndoManager {
  private undoStack: ArrangeUndoEntry[] = [];
  private redoStack: ArrangeUndoEntry[] = [];
  private pendingEntry: ArrangeUndoEntry | null = null;
  private subscribers: Set<() => void> = new Set();
  private getSnapshot: (() => ArrangeGridSnapshot) | null = null;

  /**
   * Initialize with a snapshot getter that deep-clones the current cells.
   */
  init(getSnapshot: () => ArrangeGridSnapshot): void {
    this.getSnapshot = getSnapshot;
  }

  // State Getters

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDescription(): string | null {
    const entry = this.undoStack[this.undoStack.length - 1];
    return entry?.description ?? null;
  }

  get redoDescription(): string | null {
    const entry = this.redoStack[this.redoStack.length - 1];
    return entry?.description ?? null;
  }

  // Core Operations

  captureState(type: ArrangeUndoOperationType, description: string): void {
    if (!this.getSnapshot) {
      console.warn("[ArrangeUndoManager] Not initialized - call init() first");
      return;
    }

    this.pendingEntry = {
      id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: Date.now(),
      beforeState: this.getSnapshot(),
      description,
    };
  }

  commitState(): void {
    if (!this.pendingEntry || !this.getSnapshot) return;

    this.pendingEntry.afterState = this.getSnapshot();
    if (JSON.stringify(this.pendingEntry.beforeState) === JSON.stringify(this.pendingEntry.afterState)) {
      this.pendingEntry = null;
      return;
    }

    this.undoStack.push(this.pendingEntry);

    // Trim oldest entries if over limit
    while (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    // New action invalidates redo history
    this.redoStack = [];

    this.pendingEntry = null;
    this.notifySubscribers();
  }

  commitStateCoalescing(
    coalescingKey: string,
    windowMs: number = DEFAULT_COALESCING_WINDOW_MS
  ): void {
    if (!this.pendingEntry || !this.getSnapshot) return;

    const now = Date.now();
    const lastEntry = this.undoStack[this.undoStack.length - 1];
    const afterState = this.getSnapshot();
    if (JSON.stringify(this.pendingEntry.beforeState) === JSON.stringify(afterState)) {
      this.pendingEntry = null;
      return;
    }

    // Coalesce if the previous entry has the same key within the time window
    if (
      lastEntry?.coalescingKey === coalescingKey &&
      lastEntry.type === this.pendingEntry.type &&
      this.redoStack.length === 0 &&
      now - lastEntry.timestamp < windowMs
    ) {
      // Update existing entry's afterState and description, discard pending
      lastEntry.afterState = afterState;
      lastEntry.description = this.pendingEntry.description;
      lastEntry.timestamp = now;
      this.pendingEntry = null;
      // Coalescing still invalidates redo
      this.redoStack = [];
      this.notifySubscribers();
      return;
    }

    // No coalescing - normal commit with key attached
    this.pendingEntry.coalescingKey = coalescingKey;
    this.commitState();
  }

  cancelPending(): void {
    this.pendingEntry = null;
  }

  undo(): UndoResult | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    this.notifySubscribers();

    return { snapshot: structuredClone(entry.beforeState), description: entry.description };
  }

  redo(): UndoResult | null {
    const entry = this.redoStack.pop();
    if (!entry?.afterState) return null;

    this.undoStack.push(entry);
    this.notifySubscribers();

    return { snapshot: structuredClone(entry.afterState), description: entry.description };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingEntry = null;
    this.notifySubscribers();
  }

  // =========================================================================
  // Observable
  // =========================================================================

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback();
      } catch (err) {
        console.error("[ArrangeUndoManager] Subscriber error:", err);
      }
    }
  }
}
