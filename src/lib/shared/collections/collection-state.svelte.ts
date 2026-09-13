import type { CollectionEntry } from "./collection-entry";
import type { FirebaseCollectionRepository } from "./firebase-collection-repository";
import type { LocalCollectionRepository } from "./local-collection-repository";

export interface CollectionEntryLifecycle<T extends CollectionEntry> {
  /** Enrich a newly allocated entry before either reactive state or persistence sees it. */
  prepareAdd?(entry: T): Promise<T>;
  /** Enrich a content edit while the previous immutable state is still available. */
  prepareUpdate?(previous: T, next: T): Promise<T>;
}

/**
 * Reactive store for one saved-artifact collection (tunnels, mandalas,
 * 3D scenes). One behavior for all of them:
 *
 * - Signed in: Firestore is the source of truth; writes are optimistic with
 *   rollback so the UI never diverges from the store.
 * - Guest: the local repository persists the collection so saves survive a
 *   reload, and everything migrates to Firestore on sign-in.
 */
export class CollectionState<T extends CollectionEntry> {
  private ownedCollection = $state<T[]>([]);
  private previewCollection = $state<T[] | null>(null);
  private previewUserId = $state<string | null>(null);
  // True while Firestore hydration is in flight, so galleries show a loading
  // indicator instead of mistaking "not loaded yet" for "empty".
  private ownedLoading = $state(false);
  private previewLoading = $state(false);
  private userId: string | null = null;
  private localLoaded = false;
  private startedFor: string | null = null;
  private previewRevision = 0;
  // Which optimistic edit is currently on display for an entry, so a failed
  // write only rolls back if nothing newer has replaced it.
  private writeRevision = 0;
  private readonly writeRevisions = new Map<string, number>();

  constructor(
    private readonly repo: FirebaseCollectionRepository<T>,
    private readonly localRepo: LocalCollectionRepository<T>,
    private readonly lifecycle?: CollectionEntryLifecycle<T>
  ) {}

  get collection(): T[] {
    return this.previewCollection ?? this.ownedCollection;
  }

  get loading(): boolean {
    return this.previewUserId ? this.previewLoading : this.ownedLoading;
  }

  get isReadOnlyPreview(): boolean {
    return this.previewUserId !== null;
  }

  /**
   * Hydrate this store for a user, and point its WRITES at them.
   *
   * The uid passed here must always be the signed-in user's. These stores are
   * module-level singletons standing for "my saved art", and this call
   * repoints `add`/`remove`/`rename` as well as the read — so handing it
   * somebody else's uid quietly makes your own saves target their namespace.
   *
   * The profile stage did exactly that while rendering a visited creator, and
   * because ordinary cross-user reads are rejected, `collection` kept the
   * previous user's entries, and one person's saved art rendered on another
   * person's profile. Admin preview uses `startReadOnlyPreview()` so another
   * user's data never becomes this singleton's write target.
   */
  async init(userId: string): Promise<void> {
    this.userId = userId;
    this.startedFor = userId;
    this.ownedLoading = true;
    try {
      const firebaseEntries = await this.repo.load(userId);
      this.ownedCollection = firebaseEntries;
      await this.migrateFromLocalStorage(userId, firebaseEntries);
    } finally {
      this.ownedLoading = false;
    }
  }

  /**
   * Idempotently kick off Firestore hydration for this user. A no-op once
   * already started (or starting) for the current uid, so a lazy consumer
   * (e.g. the Library Art shelf) never races or duplicates the boot-time
   * `init()` auth-boot-orchestrator already triggered. Mirrors
   * collections-state.svelte.ts's `ensureStarted()`.
   */
  ensureStarted(userId: string): void {
    if (this.startedFor === userId) return;
    void this.init(userId);
  }

  /**
   * Show another user's saved Art without repointing this singleton's writes.
   * Preview changes can arrive faster than Firestore; only the newest request
   * may replace what the Library shows.
   */
  async startReadOnlyPreview(userId: string): Promise<void> {
    if (this.previewUserId === userId) return;
    const revision = ++this.previewRevision;
    this.previewUserId = userId;
    this.previewCollection = [];
    this.previewLoading = true;
    try {
      const entries = await this.repo.load(userId);
      if (revision !== this.previewRevision || this.previewUserId !== userId) {
        return;
      }
      this.previewCollection = entries;
    } finally {
      if (revision === this.previewRevision && this.previewUserId === userId) {
        this.previewLoading = false;
      }
    }
  }

  stopReadOnlyPreview(): void {
    this.previewRevision += 1;
    this.previewUserId = null;
    this.previewCollection = null;
    this.previewLoading = false;
  }

  /** Guest-mode boot: hydrate from localStorage without a Firestore read. */
  initLocal(): void {
    this.ensureLocalLoaded();
  }

  /**
   * Lazily pull persisted guest entries into the store before the first guest
   * read or mutation, so a guest save never overwrites earlier guest saves
   * that simply hadn't been loaded yet.
   */
  private ensureLocalLoaded(): void {
    if (this.userId || this.localLoaded) return;
    this.localLoaded = true;
    const persisted = this.localRepo.load();
    if (persisted.length === 0) return;
    const known = new Set(this.ownedCollection.map((e) => e.id));
    this.ownedCollection.push(...persisted.filter((e) => !known.has(e.id)));
  }

  teardown(): void {
    this.ownedCollection = [];
    this.ownedLoading = false;
    this.userId = null;
    this.localLoaded = false;
    this.startedFor = null;
    this.writeRevisions.clear();
    this.stopReadOnlyPreview();
  }

  private assertWritable(): void {
    if (this.isReadOnlyPreview) {
      throw new Error("Saved Art is read-only while previewing another user");
    }
  }

  /**
   * Write one optimistic edit into the list, resolving the slot by identity at
   * the moment of the write rather than trusting an index captured earlier.
   *
   * Every write here is awaited — the Firestore round trip, and an async
   * `prepareUpdate` before it — so another gallery action can land in between
   * and shift every index after it. Returns what a rollback needs (the
   * displaced entry plus a token identifying this write), or null when the
   * entry is gone because a delete landed first: the edit is then dropped
   * instead of resurrecting it.
   */
  private applyEntry(next: T): { displaced: T; revision: number } | null {
    const idx = this.ownedCollection.findIndex((e) => e.id === next.id);
    if (idx === -1) return null;
    const displaced = this.ownedCollection[idx]!;
    this.ownedCollection[idx] = next;
    const revision = ++this.writeRevision;
    this.writeRevisions.set(next.id, revision);
    return { displaced, revision };
  }

  /**
   * Undo one optimistic edit after its write failed. Rolling back at the index
   * captured before the await used to drop the old entry on top of whichever
   * entry had moved into that slot — one entry duplicated, the other silently
   * gone from the gallery. Re-find the slot by id instead, and only roll back
   * the newest write for that entry: a later edit supersedes this one, and an
   * entry deleted meanwhile stays deleted. (Identity can't stand in for the
   * revision — `$state` hands back a proxy, never the object we wrote.)
   */
  private rollbackEntry(previous: T, id: string, revision: number): void {
    if (this.writeRevisions.get(id) !== revision) return;
    this.writeRevisions.delete(id);
    const idx = this.ownedCollection.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this.ownedCollection[idx] = previous;
  }

  /**
   * Put an optimistically removed entry back after a failed delete.
   * `followingId` is the entry it sat in front of: while that neighbour is
   * still present the entry lands in exactly its old place, and otherwise it
   * goes to the end rather than at a stale index that now belongs to another
   * entry.
   */
  private restoreEntry(entry: T, followingId: string | undefined): void {
    if (this.ownedCollection.some((e) => e.id === entry.id)) return;
    const neighbourIdx = followingId
      ? this.ownedCollection.findIndex((e) => e.id === followingId)
      : -1;
    if (neighbourIdx === -1) this.ownedCollection.push(entry);
    else this.ownedCollection.splice(neighbourIdx, 0, entry);
  }

  async add(entry: Omit<T, "id" | "createdAt">): Promise<T> {
    this.assertWritable();
    this.ensureLocalLoaded();
    let full = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    } as T;
    if (this.lifecycle?.prepareAdd) {
      full = await this.lifecycle.prepareAdd(full);
    }
    this.ownedCollection.unshift(full);

    if (this.userId) {
      try {
        await this.repo.save(this.userId, full);
      } catch (error) {
        const idx = this.ownedCollection.findIndex((e) => e.id === full.id);
        if (idx !== -1) this.ownedCollection.splice(idx, 1);
        throw error;
      }
    } else {
      this.localRepo.save(this.ownedCollection);
    }
    return full;
  }

  async remove(id: string): Promise<void> {
    this.assertWritable();
    this.ensureLocalLoaded();
    const idx = this.ownedCollection.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const [removed] = this.ownedCollection.splice(idx, 1);
    // Remember the neighbour it sat in front of, not its index: the list can
    // move while the delete is in flight.
    const followingId = this.ownedCollection[idx]?.id;
    if (this.userId) {
      try {
        await this.repo.remove(this.userId, id);
      } catch (error) {
        if (removed) this.restoreEntry(removed, followingId);
        throw error;
      }
    } else {
      this.localRepo.save(this.ownedCollection);
    }
  }

  /** Rename an entry (immutable swap so $derived consumers re-run). Rolls the
   *  name back if the Firestore write fails. Returns null for a blank name or
   *  unknown id. */
  async rename(id: string, name: string): Promise<T | null> {
    this.assertWritable();
    this.ensureLocalLoaded();
    const trimmed = name.trim();
    const idx = this.ownedCollection.findIndex((e) => e.id === id);
    if (idx === -1 || !trimmed) return null;
    const prev = this.ownedCollection[idx]!;
    if (prev.name === trimmed) return prev;
    const next = { ...prev, name: trimmed } as T;
    const write = this.applyEntry(next);
    if (!write) return null;
    if (this.userId) {
      try {
        await this.repo.save(this.userId, next);
      } catch (error) {
        this.rollbackEntry(write.displaced, id, write.revision);
        throw error;
      }
    } else {
      this.localRepo.save(this.ownedCollection);
    }
    return next;
  }

  /** Update an existing saved artifact without giving it a new identity. This
   * is what lets someone reopen a tunnel, change its choreography, and keep
   * every video already attached to that tunnel. */
  async update(
    id: string,
    patch: Partial<Omit<T, "id" | "createdAt">>
  ): Promise<T | null> {
    this.assertWritable();
    this.ensureLocalLoaded();
    const idx = this.ownedCollection.findIndex((entry) => entry.id === id);
    if (idx === -1) return null;

    const previous = this.ownedCollection[idx]!;
    let next = {
      ...previous,
      ...patch,
      id,
      createdAt: previous.createdAt,
    } as T;
    if (this.lifecycle?.prepareUpdate) {
      next = await this.lifecycle.prepareUpdate(previous, next);
    }
    // prepareUpdate can await, so resolve the slot again here. A null means the
    // entry was deleted while it ran: drop the edit rather than write it back.
    const write = this.applyEntry(next);
    if (!write) return null;

    if (this.userId) {
      try {
        await this.repo.save(this.userId, next);
      } catch (error) {
        this.rollbackEntry(write.displaced, id, write.revision);
        throw error;
      }
    } else {
      this.localRepo.save(this.ownedCollection);
    }
    return next;
  }

  /**
   * Replaces derived presentation material (such as a regenerated poster)
   * without running the authored-content lifecycle. A repository opts in only
   * when it can write that material without minting a revision.
   */
  async updatePresentation(
    id: string,
    patch: Partial<Omit<T, "id" | "createdAt">>
  ): Promise<T | null> {
    this.assertWritable();
    this.ensureLocalLoaded();
    const idx = this.ownedCollection.findIndex((entry) => entry.id === id);
    if (idx === -1) return null;
    const previous = this.ownedCollection[idx]!;
    const next = { ...previous, ...patch, id, createdAt: previous.createdAt } as T;
    const write = this.applyEntry(next);
    if (!write) return null;

    if (this.userId) {
      if (!this.repo.savePresentation) {
        this.rollbackEntry(write.displaced, id, write.revision);
        throw new Error("This collection cannot update presentation separately.");
      }
      try {
        await this.repo.savePresentation(this.userId, next);
      } catch (error) {
        this.rollbackEntry(write.displaced, id, write.revision);
        throw error;
      }
    } else {
      this.localRepo.save(this.ownedCollection);
    }
    return next;
  }

  get count(): number {
    return this.collection.length;
  }

  private async migrateFromLocalStorage(
    userId: string,
    existing: T[]
  ): Promise<void> {
    const localEntries = this.localRepo.load();
    if (localEntries.length === 0) return;

    const existingIds = new Set(existing.map((e) => e.id));
    const toMigrate = localEntries.filter((e) => !existingIds.has(e.id));

    for (const entry of toMigrate) {
      await this.repo.save(userId, entry);
      this.ownedCollection.push(entry);
    }

    this.localRepo.clear();
  }
}
