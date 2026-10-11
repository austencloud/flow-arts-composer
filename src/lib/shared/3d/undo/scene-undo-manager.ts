import type {
  SceneUndoOperationType,
  SceneUndoEntry,
  SceneUndoSnapshot,
} from "./scene-undo-types";

const MAX_HISTORY_SIZE = 100;
const DEFAULT_COALESCING_WINDOW_MS = 500;

type DomainKey = keyof SceneUndoSnapshot;

interface DomainHandler<K extends DomainKey = DomainKey> {
  capture: () => SceneUndoSnapshot[K];
  restore: (snapshot: NonNullable<SceneUndoSnapshot[K]>) => void;
}

export class SceneUndoManager {
  private undoStack: SceneUndoEntry[] = [];
  private redoStack: SceneUndoEntry[] = [];
  private pendingEntry: SceneUndoEntry | null = null;
  private undoDisabled = false;
  private subscribers: Set<() => void> = new Set();
  private domains = new Map<DomainKey, DomainHandler>();

  registerDomain<K extends DomainKey>(
    key: K,
    handler: {
      capture: () => SceneUndoSnapshot[K];
      restore: (s: NonNullable<SceneUndoSnapshot[K]>) => void;
    }
  ): void {
    this.domains.set(key, handler as DomainHandler);
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

  get historySize(): number {
    return this.undoStack.length;
  }

  // Core Operations

  captureState(type: SceneUndoOperationType, description: string): void {
    if (this.undoDisabled) return;

    this.pendingEntry = {
      id: `scene-undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: Date.now(),
      description,
      beforeState: this.captureSnapshot(type),
    };
  }

  commitState(): void {
    if (!this.pendingEntry || this.undoDisabled) return;

    this.pendingEntry.afterState = this.captureSnapshot(this.pendingEntry.type);
    if (snapshotsEqual(this.pendingEntry.beforeState, this.pendingEntry.afterState)) {
      this.pendingEntry = null;
      return;
    }
    this.undoStack.push(this.pendingEntry);

    while (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    this.redoStack = [];
    this.pendingEntry = null;
    this.notifySubscribers();
  }

  commitStateCoalescing(
    coalescingKey: string,
    windowMs: number = DEFAULT_COALESCING_WINDOW_MS
  ): void {
    if (!this.pendingEntry || this.undoDisabled) return;

    const now = Date.now();
    const lastEntry = this.undoStack[this.undoStack.length - 1];
    const afterState = this.captureSnapshot(this.pendingEntry.type);
    if (snapshotsEqual(this.pendingEntry.beforeState, afterState)) {
      this.pendingEntry = null;
      return;
    }

    if (
      lastEntry?.coalescingKey === coalescingKey &&
      lastEntry.type === this.pendingEntry.type &&
      this.redoStack.length === 0 &&
      !lastEntry.customRestore &&
      now - lastEntry.timestamp < windowMs
    ) {
      lastEntry.afterState = afterState;
      lastEntry.description = this.pendingEntry.description;
      lastEntry.timestamp = now;
      this.pendingEntry = null;
      this.redoStack = [];
      this.notifySubscribers();
      return;
    }

    this.pendingEntry.coalescingKey = coalescingKey;
    this.commitState();
  }

  get isUndoDisabled(): boolean {
    return this.undoDisabled;
  }

  pushSelfRestoringEntry(
    type: SceneUndoOperationType,
    description: string,
    customRestore: { undo: () => void; redo: () => void }
  ): void {
    if (this.undoDisabled) return;

    const entry: SceneUndoEntry = {
      id: `scene-undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: Date.now(),
      description,
      beforeState: {},
      customRestore,
    };

    this.undoStack.push(entry);
    while (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.pendingEntry = null;
    this.notifySubscribers();
  }

  pushSelfRestoringEntryCoalescing(
    type: SceneUndoOperationType,
    description: string,
    customRestore: { undo: () => void; redo: () => void },
    coalescingKey: string,
    windowMs: number = DEFAULT_COALESCING_WINDOW_MS
  ): void {
    if (this.undoDisabled) return;

    const now = Date.now();
    const lastEntry = this.undoStack[this.undoStack.length - 1];

    if (
      lastEntry?.coalescingKey === coalescingKey &&
      lastEntry.type === type &&
      this.redoStack.length === 0 &&
      !!lastEntry.customRestore &&
      now - lastEntry.timestamp < windowMs
    ) {
      lastEntry.customRestore = {
        undo: lastEntry.customRestore!.undo,
        redo: customRestore.redo,
      };
      lastEntry.description = description;
      lastEntry.timestamp = now;
      this.redoStack = [];
      this.notifySubscribers();
      return;
    }

    const entry: SceneUndoEntry = {
      id: `scene-undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: Date.now(),
      description,
      beforeState: {},
      coalescingKey,
      customRestore,
    };

    this.undoStack.push(entry);
    while (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.pendingEntry = null;
    this.notifySubscribers();
  }

  cancelPending(): void {
    this.pendingEntry = null;
  }

  undo(): { snapshot: SceneUndoSnapshot; description: string } | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    this.withoutUndo(() => {
      if (entry.customRestore) {
        entry.customRestore.undo();
      } else {
        this.restoreSnapshot(entry.beforeState);
      }
    });
    this.notifySubscribers();

    return {
      snapshot: structuredClone(entry.beforeState),
      description: entry.description,
    };
  }

  redo(): { snapshot: SceneUndoSnapshot; description: string } | null {
    const entry = this.redoStack.pop();
    if (!entry?.afterState && !entry?.customRestore) return null;

    this.undoStack.push(entry);
    this.withoutUndo(() => {
      if (entry.customRestore) {
        entry.customRestore.redo();
      } else if (entry.afterState) {
        this.restoreSnapshot(entry.afterState);
      }
    });
    this.notifySubscribers();

    return {
      snapshot: structuredClone(entry.afterState ?? entry.beforeState),
      description: entry.description,
    };
  }

  // =========================================================================
  // Non-Undoable Mutations
  // =========================================================================

  withoutUndo(fn: () => void): void {
    const prev = this.undoDisabled;
    this.undoDisabled = true;
    try {
      fn();
    } finally {
      this.undoDisabled = prev;
    }
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
  // Lifecycle
  // =========================================================================

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingEntry = null;
    this.notifySubscribers();
  }

  // =========================================================================
  // Private
  // =========================================================================

  private captureSnapshot(type: SceneUndoOperationType): SceneUndoSnapshot {
    const keys = domainsForOperationType(type);
    const snapshot: SceneUndoSnapshot = {};
    for (const key of keys) {
      const handler = this.domains.get(key);
      if (handler) {
        (snapshot as Record<string, unknown>)[key] = handler.capture();
      }
    }
    return snapshot;
  }

  private restoreSnapshot(snapshot: SceneUndoSnapshot): void {
    for (const key of Object.keys(snapshot) as DomainKey[]) {
      const value = snapshot[key];
      if (value === undefined) continue;
      const handler = this.domains.get(key);
      if (handler) {
        handler.restore(structuredClone(value) as never);
      }
    }
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback();
      } catch (err) {
        console.error("[SceneUndoManager] Subscriber error:", err);
      }
    }
  }
}

function snapshotsEqual(a: SceneUndoSnapshot, b: SceneUndoSnapshot): boolean {
  const encode = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map) return { entries: [...item.entries()] };
    if (item instanceof Set) return { values: [...item.values()] };
    return item;
  });
  return encode(a) === encode(b);
}

function domainsForOperationType(type: SceneUndoOperationType): DomainKey[] {
  switch (type) {
    case "spawn-performer":
    case "remove-performer":
    case "apply-formation":
    case "spatial-edit":
      return ["viewer"];
    case "change-prop":
    case "change-prop-build":
    case "change-character":
    case "change-sequence":
    case "change-grid-join":
    case "change-staff-length":
    case "change-effort":
    case "set-hand-plane":
    case "set-beat-plane-override":
      return [];
    case "toggle-effect":
      return ["effects"];
    case "update-effect-config":
    case "apply-effect-preset":
    case "restore-custom-effect":
    case "reset-effect-default":
    case "reset-all-effects":
    case "set-active-effect":
      return ["effects"];
    case "toggle-motion":
      return ["motion"];
    case "change-environment":
    case "change-grid-mode":
      return ["scene"];
    case "toggle-plane-visibility":
    case "toggle-grid-labels":
    case "toggle-ui-visibility":
      return ["visibility"];
    case "change-scene-lab-scene":
    case "update-scene-lab-config":
    case "change-cosmic-variant":
      return ["sceneLab"];
    case "change-default-prop":
    case "change-default-effort":
    case "change-default-effects":
    case "change-default-planes":
    case "reset-all-overrides":
      return ["defaults"];
  }
}
