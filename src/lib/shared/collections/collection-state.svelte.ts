import type { CollectionEntry } from "./collection-entry";
import type { FirebaseCollectionRepository } from "./firebase-collection-repository";
import type { LocalCollectionRepository } from "./local-collection-repository";

/**
 * What `prepareUpdate` added or changed, relative to the entry it was handed.
 *
 * A rebase needs the lifecycle's contribution separately from the caller's
 * patch: every other field has to come from the entry's current value, not from
 * the snapshot the update started with. Fields the lifecycle deletes outright
 * are not tracked — enrichment adds and replaces, it does not remove.
 */
function contributedFields<T extends CollectionEntry>(
  input: T,
  prepared: T
): Partial<T> {
  if (input === prepared) return {};
  const contribution: Record<string, unknown> = {};
  const before = input as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(
    prepared as unknown as Record<string, unknown>
  )) {
    if (before[key] !== value) contribution[key] = value;
  }
  return contribution as Partial<T>;
}

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
  // One in-flight update preparation per entry id (see prepareExclusively).
  private readonly preparing = new Map<string, Promise<void>>();
  // Bumped by every identity change (init, teardown). Everything above is
  // scoped to one signed-in user, so an operation started before the change may
  // not touch any of it afterwards — see `isCurrent`.
  private generation = 0;

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
    const generation = ++this.generation;
    this.userId = userId;
    this.startedFor = userId;
    this.ownedLoading = true;
    try {
      const firebaseEntries = await this.repo.load(userId);
      // A slower load for the user we just switched away from must not paint
      // their saved art into whoever is signed in now.
      if (!this.isCurrent(generation)) return;
      this.ownedCollection = firebaseEntries;
      // Everything just loaded is by definition what the repository holds, and
      // is the baseline a failed write falls back to. Bookkeeping from the
      // previous identity goes with it.
      this.confirmed.clear();
      this.inFlight.clear();
      this.removedBefore.clear();
      for (const entry of firebaseEntries) this.confirmed.set(entry.id, entry);
      await this.migrateFromLocalStorage(userId, firebaseEntries, generation);
    } finally {
      if (this.isCurrent(generation)) this.ownedLoading = false;
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
    this.generation++;
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
   * Run one entry's update preparation with nothing else preparing that entry,
   * so overlapping updates each start from the value the previous one settled
   * on. A failed preparation releases the next rather than stalling the queue.
   */
  private prepareExclusively<R>(id: string, run: () => Promise<R>): Promise<R> {
    const queued = this.preparing.get(id);
    const task = queued ? queued.then(run, run) : run();
    const quiet = task.then(
      () => undefined,
      () => undefined
    );
    this.preparing.set(id, quiet);
    void quiet.then(() => {
      if (this.preparing.get(id) === quiet) this.preparing.delete(id);
    });
    return task;
  }

  /**
   * Is the identity this operation started under still the one on screen?
   *
   * Every await here outlives the signed-in user: a held write, a slow load, or
   * an async lifecycle step can resolve after a sign-out or a uid swap. The
   * list, the confirmed baseline and the in-flight bookkeeping all belong to one
   * user, so an operation from a previous identity must touch none of them —
   * otherwise one person's saved art lands in another person's gallery.
   */
  private isCurrent(generation: number): boolean {
    return this.generation === generation;
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
    const generation = this.generation;
    this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1);
    try {
      await write();
      // A write that outlived its session still succeeded or failed for its own
      // user; it just has no claim on the state of whoever is here now. The
      // error still propagates to the caller either way.
      if (this.isCurrent(generation)) onPersisted();
    } finally {
      if (this.isCurrent(generation)) {
        const remaining = (this.inFlight.get(id) ?? 1) - 1;
        if (remaining > 0) {
          this.inFlight.set(id, remaining);
        } else {
          this.inFlight.delete(id);
          this.settleEntry(id);
        }
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
    const generation = this.generation;
    let full = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    } as T;
    if (this.lifecycle?.prepareAdd) {
      full = await this.lifecycle.prepareAdd(full);
      // Signed out (or swapped user) while the entry was being prepared: it
      // belongs to a session that is gone, and saving it now would file it
      // under whoever is here instead.
      if (!this.isCurrent(generation)) {
        throw new Error("Saved Art session ended before the save completed");
      }
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

    const generation = this.generation;
    // One preparation at a time per entry. prepareUpdate digests the entry's
    // content to mint a revision, so two overlapping preparations would each
    // digest a version that never existed on its own; serialized, the second
    // one starts from the entry the first left behind.
    const next = await this.prepareExclusively(id, async () => {
      const slot = this.ownedCollection.findIndex((entry) => entry.id === id);
      if (slot === -1) return null;
      const previous = this.ownedCollection[slot]!;
      const patched = {
        ...previous,
        ...patch,
        id,
        createdAt: previous.createdAt,
      } as T;

      if (!this.lifecycle?.prepareUpdate) {
        return this.showEntry(patched) ? patched : null;
      }

      const prepared = await this.lifecycle.prepareUpdate(previous, patched);
      if (!this.isCurrent(generation)) return null;

      // A rename does not go through preparation, so it can still land in this
      // window — and it is a real edit, not a conflict. Rebase onto the entry
      // as it stands now (the caller's patch and whatever prepareUpdate
      // contributed, over current values) instead of writing back the whole
      // snapshot this call started from, which would silently undo it.
      const current = this.ownedCollection.find((entry) => entry.id === id);
      if (!current) return null;
      const rebased = {
        ...current,
        ...patch,
        ...contributedFields(patched, prepared),
        id,
        createdAt: current.createdAt,
      } as T;
      // Shown inside the exclusive section so the next preparation for this
      // entry starts from the value this one settled on.
      return this.showEntry(rebased) ? rebased : null;
    });

    // Null means the entry was deleted, or the session ended, while the
    // lifecycle ran: drop the edit rather than write it back.
    if (!next) return null;

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
    existing: T[],
    generation: number
  ): Promise<void> {
    const localEntries = this.localRepo.load();
    if (localEntries.length === 0) return;

    const existingIds = new Set(existing.map((e) => e.id));
    const toMigrate = localEntries.filter((e) => !existingIds.has(e.id));

    for (const entry of toMigrate) {
      await this.repo.save(userId, entry);
      // Stop at the identity change rather than pushing guest entries into the
      // next user's gallery; the local copy stays put so the migration can
      // finish the next time this user signs in.
      if (!this.isCurrent(generation)) return;
      this.ownedCollection.push(entry);
      this.confirmed.set(entry.id, entry);
    }

    this.localRepo.clear();
  }
}
