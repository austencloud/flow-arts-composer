/**
 * TimelineUndoManager - Undo/redo functionality for timeline operations
 *
 * Implements command pattern with state snapshots for undoing/redoing
 * timeline operations. Persists history to localStorage.
 */

import type {
  TimelineUndoOperationType,
  TimelineUndoEntry,
  TimelineProjectSnapshot,
} from "#lib/shared/animation-engine/timeline/domain/types.js";
import type { TimelineProject } from "#lib/shared/animation-engine/domain/timeline-types.js";

const STORAGE_KEY_UNDO = "timeline-undo-history";
const STORAGE_KEY_REDO = "timeline-redo-history";
const MAX_HISTORY_SIZE = 50;

export class TimelineUndoManager {
  private undoStack: TimelineUndoEntry[] = [];
  private redoStack: TimelineUndoEntry[] = [];
  private pendingEntry: TimelineUndoEntry | null = null;
  private subscribers: Set<() => void> = new Set();

  // Reference to get current project state (injected via init)
  private getCurrentProject: (() => TimelineProject) | null = null;
  private getCurrentAudioUrl: (() => string | null) | null = null;
  private ownedAudioUrls = new Set<string>();

  constructor() {
    this.load();
  }

  /**
   * Initialize with a project getter function.
   * Must be called before using capture/commit.
   */
  init(
    getCurrentProject: () => TimelineProject,
    getCurrentAudioUrl: () => string | null
  ): void {
    this.getCurrentProject = getCurrentProject;
    this.getCurrentAudioUrl = getCurrentAudioUrl;
  }

  trackAudioUrl(url: string): void {
    if (url.startsWith("blob:")) this.ownedAudioUrls.add(url);
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

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  // Core Operations

  captureState(type: TimelineUndoOperationType, description: string): void {
    if (!this.getCurrentProject) {
      console.warn("[TimelineUndoManager] Not initialized - call init() first");
      return;
    }

    const project = this.getCurrentProject();
    this.pendingEntry = {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      beforeState: {
        project: this.deepCloneProject(project),
        timestamp: Date.now(),
        audioUrl: this.getCurrentAudioUrl?.() ?? null,
      },
      description,
    };
  }

  commitState(): void {
    if (!this.pendingEntry || !this.getCurrentProject) {
      return;
    }

    const project = this.getCurrentProject();
    this.pendingEntry.afterState = {
      project: this.deepCloneProject(project),
      timestamp: Date.now(),
      audioUrl: this.getCurrentAudioUrl?.() ?? null,
    };
    if (
      projectsEqual(
        this.pendingEntry.beforeState.project,
        this.pendingEntry.afterState.project
      ) &&
      this.pendingEntry.beforeState.audioUrl ===
        this.pendingEntry.afterState.audioUrl
    ) {
      this.pendingEntry = null;
      this.releaseUnusedAudioUrls();
      return;
    }

    this.undoStack.push(this.pendingEntry);

    // Trim if over max size
    while (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    // Clear redo stack (new action invalidates redo history)
    this.redoStack = [];

    this.pendingEntry = null;
    this.releaseUnusedAudioUrls();
    this.notifySubscribers();
    this.save();
  }

  cancelPending(): void {
    this.pendingEntry = null;
    this.releaseUnusedAudioUrls();
  }

  undo(): TimelineProjectSnapshot | null {
    const entry = this.undoStack.pop();
    if (!entry) {
      return null;
    }

    // Move to redo stack
    this.redoStack.push(entry);

    this.notifySubscribers();
    this.save();

    return {
      ...entry.beforeState,
      project: this.deepCloneProject(entry.beforeState.project),
    };
  }

  redo(): TimelineProjectSnapshot | null {
    const entry = this.redoStack.pop();
    if (!entry?.afterState) {
      return null;
    }

    // Move back to undo stack
    this.undoStack.push(entry);

    this.notifySubscribers();
    this.save();

    return {
      ...entry.afterState,
      project: this.deepCloneProject(entry.afterState.project),
    };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingEntry = null;
    this.releaseUnusedAudioUrls();
    this.notifySubscribers();
    this.save();
  }

  // Persistence

  save(): void {
    if (typeof window === "undefined") return;

    try {
      // Sources are session-only; entries involving audio cannot replay after reload.
      const undoMeta = this.undoStack.filter(isPersistableEntry).map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        description: e.description,
        beforeState: this.persistentSnapshot(e.beforeState),
        afterState: e.afterState && this.persistentSnapshot(e.afterState),
      }));

      const redoMeta = this.redoStack.filter(isPersistableEntry).map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        description: e.description,
        beforeState: this.persistentSnapshot(e.beforeState),
        afterState: e.afterState && this.persistentSnapshot(e.afterState),
      }));

      localStorage.setItem(STORAGE_KEY_UNDO, JSON.stringify(undoMeta));
      localStorage.setItem(STORAGE_KEY_REDO, JSON.stringify(redoMeta));
    } catch (err) {
      console.warn("[TimelineUndoManager] Failed to save history:", err);
    }
  }

  load(): void {
    if (typeof window === "undefined") return;

    try {
      const undoData = localStorage.getItem(STORAGE_KEY_UNDO);
      const redoData = localStorage.getItem(STORAGE_KEY_REDO);

      if (undoData) {
        const parsed = JSON.parse(undoData);
        this.undoStack = this.restoreDates(parsed).filter(isPersistableEntry);
      }

      if (redoData) {
        const parsed = JSON.parse(redoData);
        this.redoStack = this.restoreDates(parsed).filter(isPersistableEntry);
      }
    } catch (err) {
      console.warn("[TimelineUndoManager] Failed to load history:", err);
      this.undoStack = [];
      this.redoStack = [];
    }
  }

  // Observable

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Private Helpers

  private persistentSnapshot(
    snapshot: TimelineProjectSnapshot
  ): TimelineProjectSnapshot {
    return { project: snapshot.project, timestamp: snapshot.timestamp };
  }

  private releaseUnusedAudioUrls(): void {
    const referenced = new Set<string>();
    const add = (url: string | null | undefined) => {
      if (url) referenced.add(url);
    };
    add(this.getCurrentAudioUrl?.());
    for (const entry of [
      ...this.undoStack,
      ...this.redoStack,
      ...(this.pendingEntry ? [this.pendingEntry] : []),
    ]) {
      add(entry.beforeState.audioUrl);
      add(entry.afterState?.audioUrl);
    }
    for (const url of this.ownedAudioUrls) {
      if (!referenced.has(url)) {
        URL.revokeObjectURL(url);
        this.ownedAudioUrls.delete(url);
      }
    }
  }

  dispose(): void {
    this.getCurrentAudioUrl = null;
    this.undoStack = [];
    this.redoStack = [];
    this.pendingEntry = null;
    this.releaseUnusedAudioUrls();
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback();
      } catch (err) {
        console.error("[TimelineUndoManager] Subscriber error:", err);
      }
    }
  }

  private generateId(): string {
    return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private deepCloneProject(project: TimelineProject): TimelineProject {
    // Deep clone using JSON (safe for our data model)
    const cloned = JSON.parse(JSON.stringify(project));

    // Restore Date objects
    if (cloned.createdAt) cloned.createdAt = new Date(cloned.createdAt);
    if (cloned.updatedAt) cloned.updatedAt = new Date(cloned.updatedAt);

    return cloned;
  }

  private restoreDates(entries: TimelineUndoEntry[]): TimelineUndoEntry[] {
    return entries.map((entry) => {
      // Restore project dates in beforeState
      if (entry.beforeState?.project) {
        const proj = entry.beforeState.project;
        if (proj.createdAt) proj.createdAt = new Date(proj.createdAt);
        if (proj.updatedAt) proj.updatedAt = new Date(proj.updatedAt);
      }

      // Restore project dates in afterState
      if (entry.afterState?.project) {
        const proj = entry.afterState.project;
        if (proj.createdAt) proj.createdAt = new Date(proj.createdAt);
        if (proj.updatedAt) proj.updatedAt = new Date(proj.updatedAt);
      }

      return entry;
    });
  }
}

function projectsEqual(a: TimelineProject, b: TimelineProject): boolean {
  // updatedAt records persistence activity, not a user-visible project edit.
  const { updatedAt: _aUpdatedAt, ...aContent } = a;
  const { updatedAt: _bUpdatedAt, ...bContent } = b;
  return JSON.stringify(aContent) === JSON.stringify(bContent);
}

function isPersistableEntry(entry: TimelineUndoEntry): boolean {
  return (
    !!entry.beforeState?.project?.audio &&
    !!entry.afterState?.project?.audio &&
    !entry.beforeState.project.audio.hasAudio &&
    !entry.afterState.project.audio.hasAudio &&
    !entry.beforeState.audioUrl &&
    !entry.afterState.audioUrl
  );
}

// ============================================================================
// Singleton Factory
// ============================================================================

let undoManagerInstance: TimelineUndoManager | null = null;

/**
 * Get the singleton TimelineUndoManager instance.
 */
export function getTimelineUndoManager(): TimelineUndoManager {
  if (!undoManagerInstance) {
    undoManagerInstance = new TimelineUndoManager();
  }
  return undoManagerInstance;
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetTimelineUndoManager(): void {
  undoManagerInstance?.dispose();
  undoManagerInstance = null;
}
