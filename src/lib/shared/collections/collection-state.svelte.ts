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
  // The last value the repository is known to hold for an entry — the only
  // thing a failed write may fall back to. Absent means "not persisted".
  private readonly confirmed = new Map<string, T>();
  // Repository mutations still in flight per entry, so the display is settled
  // once, by whichever one finishes last.
  private readonly inFlight = new Map<string, number>();
  // Where an optimistically removed entry sat, so a failed delete can put the
  // confirmed entry back in its old place.
  private readonly removedBefore = new Map<string, string | undefined>();

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
      // Everything just loaded is by definition what the repository holds, and
      // is the baseline a failed write falls back to.
      this.confirmed.clear();
      for (const entry of firebaseEntries) this.confirmed.set(entry.id, entry);
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
    const restored = persisted.filter((e) => !known.has(e.id));
    this.ownedCollection.push(...restored);
    for (const entry of restored) this.confirmed.set(entry.id, entry);
  }

  teardown(): void {
    this.ownedCollection = [];
    this.ownedLoading = false;
    this.userId = null;
    this.localLoaded = false;
    this.startedFor = null;
    this.confirmed.clear();
    this.inFlight.clear();
    this.removedBefore.clear();
    this.stopReadOnlyPreview();
  }

  private assertWritable(): void {
    if (this.isReadOnlyPreview) {
      throw new Error("Saved Art is read-only while previewing another user");
    }
  }

  /**
   * Show one optimistic edit, resolving the slot by id at the moment of the
   * write rather than trusting an index captured earlier. Every write here is
   * awaited — the repository round trip, and an async `prepareUpdate` before it
   * — so another gallery action can land in between and shift every index after
   * it. False means the entry is gone because a delete landed first: the edit
   * is then dropped instead of resurrecting it.
   */
  private showEntry(next: T): boolean {
    const idx = this.ownedCollection.findIndex((e) => e.id === next.id);
    if (idx === -1) return false;
    this.ownedCollection[idx] = next;
    return true;
  }

  /**
   * Run one repository mutation for an entry and settle the display when it is
   * the last one outstanding for that id.
   *
   * Two overlapping writes can both fail, and the loser of that race is not a
   * safe fallback: rolling back to whatever value the failed edit displaced
   * leaves an optimistic name on screen that the repository never accepted.
   * Settling against `confirmed` instead means the gallery always lands on what
   * was actually persisted, whichever order the failures arrive in. While
   * another write for the same entry is still in flight nothing is settled —
   * that write owns the display until it, too, resolves.
   */
  private async commitWrite(
    id: string,
    write: () => Promise<void>,
    onPersisted: () => void
  ): Promise<void> {
    this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1);
    try {
      await write();
      onPersisted();
    } finally {
      const remaining = (this.inFlight.get(id) ?? 1) - 1;
      if (remaining > 0) {
        this.inFlight.set(id, remaining);
      } else {
        this.inFlight.delete(id);
        this.settleEntry(id);
      }
    }
  }

  /** Bring one entry's display back in line with what the repository holds. */
  private settleEntry(id: string): void {
    const persisted = this.confirmed.get(id);
    const followingId = this.removedBefore.get(id);
    this.removedBefore.delete(id);
    const idx = this.ownedCollection.findIndex((e) => e.id === id);

    if (!persisted) {
      // Never persisted (or successfully deleted): it does not belong here.
      if (idx !== -1) this.ownedCollection.splice(idx, 1);
      return;
    }
    if (idx !== -1) {
      this.ownedCollection[idx] = persisted;
      return;
    }
    // Optimistically removed, but the delete failed. `followingId` is the entry
    // it sat in front of: while that neighbour is still there it lands in
    // exactly its old place, otherwise at the end rather than at a stale index
    // that now belongs to another entry.
    const neighbourIdx = followingId
      ? this.ownedCollection.findIndex((e) => e.id === followingId)
      : -1;
    if (neighbourIdx === -1) this.ownedCollection.push(persisted);
    else this.ownedCollection.splice(neighbourIdx, 0, persisted);
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

    const userId = this.userId;
    if (userId) {
      await this.commitWrite(
        full.id,
        () => this.repo.save(userId, full),
        () => this.confirmed.set(full.id, full)
      );
    } else {
      this.confirmed.set(full.id, full);
      this.localRepo.save(this.ownedCollection);
    }
    return full;
  }

  async remove(id: string): Promise<void> {
    this.assertWritable();
    this.ensureLocalLoaded();
    const idx = this.ownedCollection.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this.ownedCollection.splice(idx, 1);
    // Remember the neighbour it sat in front of, not its index: the list can
    // move while the delete is in flight.
    this.removedBefore.set(id, this.ownedCollection[idx]?.id);

    const userId = this.userId;
    if (userId) {
      await this.commitWrite(
        id,
        () => this.repo.remove(userId, id),
        () => this.confirmed.delete(id)
      );
    } else {
      this.confirmed.delete(id);
      this.removedBefore.delete(id);
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
    if (!this.showEntry(next)) return null;

    const userId = this.userId;
    if (userId) {
      await this.commitWrite(
        id,
        () => this.repo.save(userId, next),
        () => this.confirmed.set(id, next)
      );
    } else {
      this.confirmed.set(id, next);
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
    // prepareUpdate can await, so resolve the slot again here. False means the
    // entry was deleted while it ran: drop the edit rather than write it back.
    if (!this.showEntry(next)) return null;

    const userId = this.userId;
    if (userId) {
      await this.commitWrite(
        id,
        () => this.repo.save(userId, next),
        () => this.confirmed.set(id, next)
      );
    } else {
      this.confirmed.set(id, next);
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
    const userId = this.userId;
    const savePresentation = this.repo.savePresentation;
    // Refuse before showing anything: an unsupported repository has no write to
    // roll back from.
    if (userId && !savePresentation) {
      throw new Error("This collection cannot update presentation separately.");
    }

    const previous = this.ownedCollection[idx]!;
    const next = { ...previous, ...patch, id, createdAt: previous.createdAt } as T;
    if (!this.showEntry(next)) return null;

    if (userId && savePresentation) {
      await this.commitWrite(
        id,
        () => savePresentation(userId, next),
        () => this.confirmed.set(id, next)
      );
    } else {
      this.confirmed.set(id, next);
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
      this.confirmed.set(entry.id, entry);
    }

    this.localRepo.clear();
  }
}
