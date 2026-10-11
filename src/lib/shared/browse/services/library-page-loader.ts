import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { LibraryPageCursor } from "#lib/shared/library/domain/library-contract-types.js";
import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

const PAGE_SIZE = 48;
const FRESH_MS = 60_000;

export interface LibraryLoadSnapshot {
  readonly rows: readonly SequenceData[];
  readonly complete: boolean;
  readonly loading: boolean;
  readonly error: string | null;
}

type Listener = (snapshot: LibraryLoadSnapshot) => void;

/** One owner for the paged account library, shared by the shelf and grids. */
export class LibraryPageLoader {
  private userId: string | null = null;
  private rows: SequenceData[] = [];
  private cursor: LibraryPageCursor | null = null;
  private complete = false;
  private error: string | null = null;
  private first: Promise<void> | null = null;
  private loading = false;
  private fetchedAt = 0;
  private revision = 0;
  private listeners = new Set<{ userId: string; listener: Listener }>();
  private removed = new Set<string>();
  private localAdds = new Map<string, SequenceData>();
  private localPatches = new Map<string, Record<string, unknown>>();
  private refreshedRows: Map<string, SequenceData> | null = null;

  constructor(
    private readonly currentUserId: () => string | null = () =>
      authState.isFullAccount ? authState.effectiveUserId : null
  ) {}

  get snapshot(): LibraryLoadSnapshot {
    return {
      rows: this.rows,
      complete: this.complete,
      loading: this.loading,
      error: this.error,
    };
  }

  subscribe(userId: string, listener: Listener): () => void {
    this.selectUser(userId);
    const subscription = { userId, listener };
    this.listeners.add(subscription);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(subscription);
    };
  }

  private publish(): void {
    const snapshot = this.snapshot;
    for (const subscription of this.listeners) {
      if (subscription.userId === this.userId) subscription.listener(snapshot);
    }
  }

  private selectUser(userId: string): void {
    if (this.userId === userId) return;
    this.revision++;
    this.userId = userId;
    this.rows = [];
    this.cursor = null;
    this.complete = false;
    this.error = null;
    this.loading = false;
    this.first = null;
    this.fetchedAt = 0;
    this.removed.clear();
    this.localAdds.clear();
    this.localPatches.clear();
    this.refreshedRows = null;
    this.publish();
  }

  clear(): void {
    if (this.userId === null) return;
    this.revision++;
    this.userId = null;
    this.rows = [];
    this.cursor = null;
    this.complete = false;
    this.error = null;
    this.loading = false;
    this.first = null;
    this.fetchedAt = 0;
    this.removed.clear();
    this.localAdds.clear();
    this.localPatches.clear();
    this.refreshedRows = null;
  }

  async load(userId: string, refresh = false): Promise<void> {
    this.selectUser(userId);
    if (refresh) {
      this.revision++;
      this.first = null;
      this.loading = false;
    }
    if (this.first) return this.first;
    if (this.loading) return;
    if (refresh || (this.complete && Date.now() - this.fetchedAt >= FRESH_MS)) {
      this.revision++;
      this.cursor = null;
      this.complete = false;
      this.error = null;
      this.refreshedRows = new Map();
      this.removed.clear();
      this.localAdds.clear();
      this.localPatches.clear();
      this.publish();
    }
    if (this.complete) return;
    const revision = ++this.revision;
    this.loading = true;
    this.error = null;
    this.publish();
    this.first = this.readPage(revision).finally(() => {
      if (revision === this.revision) this.first = null;
    });
    await this.first;
    if (revision === this.revision && !this.complete && !this.error) {
      void this.drain(revision);
    }
  }

  private async drain(revision: number): Promise<void> {
    while (revision === this.revision && !this.complete && !this.error) {
      await this.readPage(revision);
    }
  }

  private async readPage(revision: number): Promise<void> {
    const requestedUserId = this.userId;
    if (!requestedUserId || this.currentUserId() !== requestedUserId) {
      this.clear();
      return;
    }
    try {
      const page = await getLibraryRepository().getSequencePage(
        { limit: PAGE_SIZE },
        this.cursor
      );
      if (revision !== this.revision) return;
      if (this.currentUserId() !== requestedUserId) {
        this.clear();
        return;
      }
      const byId =
        this.refreshedRows ?? new Map(this.rows.map((row) => [row.id, row]));
      for (const row of page.sequences) {
        if (!this.removed.has(row.id) && !this.localAdds.has(row.id)) {
          byId.set(row.id, { ...row, ...this.localPatches.get(row.id) });
        }
      }
      this.cursor = page.nextCursor;
      this.complete = page.exhausted;
      if (this.refreshedRows) {
        const visible = new Map(this.rows.map((row) => [row.id, row]));
        for (const [id, row] of byId) visible.set(id, row);
        this.rows = this.complete
          ? [...this.localAdds.values(), ...byId.values()].filter(
              (row, index, rows) =>
                !this.removed.has(row.id) &&
                rows.findIndex((candidate) => candidate.id === row.id) === index
            )
          : [...visible.values()];
        if (this.complete) this.refreshedRows = null;
      } else {
        this.rows = [...byId.values()];
      }
      if (this.complete) this.fetchedAt = Date.now();
      this.loading = !this.complete;
      this.publish();
    } catch (error) {
      if (revision !== this.revision) return;
      if (this.currentUserId() !== requestedUserId) {
        this.clear();
        return;
      }
      this.error =
        error instanceof Error ? error.message : "Failed to load library";
      this.loading = false;
      this.publish();
    }
  }

  remove(userId: string, sequenceId: string): void {
    if (this.userId !== userId) return;
    this.removed.add(sequenceId);
    this.localAdds.delete(sequenceId);
    this.refreshedRows?.delete(sequenceId);
    this.rows = this.rows.filter((row) => row.id !== sequenceId);
    this.publish();
  }

  add(userId: string, sequence: SequenceData): void {
    if (this.userId !== userId) return;
    this.removed.delete(sequence.id);
    this.localAdds.set(sequence.id, sequence);
    this.refreshedRows?.set(sequence.id, sequence);
    this.rows = [
      sequence,
      ...this.rows.filter((row) => row.id !== sequence.id),
    ];
    this.publish();
  }

  patch(
    userId: string,
    sequenceId: string,
    updates: Record<string, unknown>
  ): void {
    if (this.userId !== userId) return;
    const added = this.localAdds.get(sequenceId);
    if (added) this.localAdds.set(sequenceId, { ...added, ...updates });
    this.localPatches.set(sequenceId, {
      ...this.localPatches.get(sequenceId),
      ...updates,
    });
    const refreshed = this.refreshedRows?.get(sequenceId);
    if (refreshed)
      this.refreshedRows?.set(sequenceId, {
        ...refreshed,
        ...updates,
      } as SequenceData);
    this.rows = this.rows.map((row) =>
      row.id === sequenceId ? ({ ...row, ...updates } as SequenceData) : row
    );
    this.publish();
  }
}
