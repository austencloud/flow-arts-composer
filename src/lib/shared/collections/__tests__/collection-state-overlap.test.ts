import { describe, it, expect, beforeEach } from "vitest";
import { CollectionState } from "../collection-state.svelte";
import { LocalCollectionRepository } from "../local-collection-repository";
import type { CollectionEntry } from "../collection-entry";
import type { FirebaseCollectionRepository } from "../firebase-collection-repository";

/**
 * Overlapping-write integrity for one saved-artifact collection.
 *
 * Every optimistic mutation here is `await`ed against Firestore, so a second
 * gallery action (a save finishing, a delete, another rename) can land while
 * the first is still in flight. These cases hold the repository write open on
 * purpose so the overlap is deterministic rather than timing-dependent, then
 * assert the exact final list: no entry duplicated, none silently dropped, and
 * the order the user would expect.
 */

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

interface Deferred {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * A repository whose operations can be held open. `holdSave("x")` makes the
 * next `save` of entry `x` block until the test resolves or rejects it, and
 * `holdLoad(uid)` does the same for that user's hydration; everything else
 * completes immediately.
 */
interface ControllableRepo
  extends FirebaseCollectionRepository<CollectionEntry> {
  saved: CollectionEntry[];
  savedBy: { userId: string; entry: CollectionEntry }[];
  removed: string[];
  remoteByUser: Map<string, CollectionEntry[]>;
  holdSave(id: string): void;
  holdRemove(id: string): void;
  holdLoad(userId: string): void;
  pending(key: string): Deferred;
  pendingLoad(userId: string): Deferred;
}

function makeRepo(): ControllableRepo {
  // Counted, not a set: an entry can have two writes held at once, which is
  // the whole point of the both-fail cases.
  const held = new Map<string, number>();
  const pending = new Map<string, Deferred[]>();

  function gate(id: string): Promise<void> {
    const holds = held.get(id) ?? 0;
    if (holds === 0) return Promise.resolve();
    held.set(id, holds - 1);
    return new Promise<void>((resolve, reject) => {
      const queue = pending.get(id) ?? [];
      queue.push({ resolve: () => resolve(), reject });
      pending.set(id, queue);
    });
  }

  const hold = (id: string) => void held.set(id, (held.get(id) ?? 0) + 1);

  const loadKey = (userId: string) => `load:${userId}`;

  const repo: ControllableRepo = {
    async load(userId) {
      await gate(loadKey(userId));
      return [...(repo.remoteByUser.get(userId) ?? [])];
    },
    async save(uid, entry) {
      await gate(entry.id);
      repo.saved.push(entry);
      repo.savedBy.push({ userId: uid, entry });
    },
    async remove(_uid, id) {
      await gate(id);
      repo.removed.push(id);
    },
    saved: [],
    savedBy: [],
    removed: [],
    remoteByUser: new Map(),
    holdSave: hold,
    holdRemove: hold,
    holdLoad: (userId) => hold(loadKey(userId)),
    // Oldest first, so a test settles held operations in the order they started.
    pending: (key) => {
      const deferred = pending.get(key)?.shift();
      if (!deferred) throw new Error(`nothing held for ${key}`);
      return deferred;
    },
    pendingLoad: (userId) => repo.pending(loadKey(userId)),
  };
  return repo;
}

/** Let the microtask queue drain so a held write's rejection propagates. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise a test opens by hand, for holding a lifecycle step open. */
function gateway(): { passed: Promise<void>; open: () => void } {
  let open!: () => void;
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { passed, open };
}

describe("CollectionState overlapping writes", () => {
  let repo: ControllableRepo;
  let s: CollectionState<CollectionEntry>;

  beforeEach(async () => {
    repo = makeRepo();
    s = new CollectionState(
      repo,
      new LocalCollectionRepository("tka:test-overlap", 1, makeStorage())
    );
    await s.init("user-1");
  });

  it("rolls a failed rename back onto the renamed entry, not whichever entry now sits at its old index", async () => {
    const a = await s.add({ name: "A" });

    repo.holdSave(a.id);
    const renaming = s.rename(a.id, "Renamed");
    await settle();

    // A save landing from another surface prepends and shifts every index.
    const b = await s.add({ name: "B" });
    expect(s.collection.map((e) => e.id)).toEqual([b.id, a.id]);

    repo.pending(a.id).reject(new Error("save denied"));
    await expect(renaming).rejects.toThrow("save denied");

    expect(s.collection.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(s.collection.map((e) => e.name)).toEqual(["B", "A"]);
  });

  it("rolls a failed update back onto the edited entry after an earlier entry is removed", async () => {
    const a = await s.add({ name: "A" });
    const b = await s.add({ name: "B" });
    const c = await s.add({ name: "C" }); // prepends → [c, b, a]

    repo.holdSave(a.id);
    const updating = s.update(a.id, { name: "Edited" });
    await settle();

    await s.remove(b.id); // [c, a] — `a` is no longer at index 2
    expect(s.collection.map((e) => e.id)).toEqual([c.id, a.id]);

    repo.pending(a.id).reject(new Error("save denied"));
    await expect(updating).rejects.toThrow("save denied");

    expect(s.collection.map((e) => e.id)).toEqual([c.id, a.id]);
    expect(s.collection.map((e) => e.name)).toEqual(["C", "A"]);
  });

  it("restores a failed delete next to the entry that followed it, not at a stale index", async () => {
    const a = await s.add({ name: "A" });
    const b = await s.add({ name: "B" }); // [b, a]

    repo.holdRemove(b.id);
    const removing = s.remove(b.id); // optimistic [a]
    await settle();

    const c = await s.add({ name: "C" }); // [c, a]

    repo.pending(b.id).reject(new Error("delete denied"));
    await expect(removing).rejects.toThrow("delete denied");

    // `b` sat immediately before `a`, and `c` was saved afterwards, so the
    // restored list is the newest save first and `b` back in front of `a`.
    expect(s.collection.map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it("leaves a concurrently deleted entry deleted when its own rename fails", async () => {
    const a = await s.add({ name: "A" });

    repo.holdSave(a.id);
    const renaming = s.rename(a.id, "Renamed");
    await settle();

    await s.remove(a.id);
    expect(s.collection).toHaveLength(0);

    repo.pending(a.id).reject(new Error("save denied"));
    await expect(renaming).rejects.toThrow("save denied");

    expect(s.collection).toHaveLength(0);
  });

  it("falls back to the persisted name when both overlapping edits fail", async () => {
    const a = await s.add({ name: "A" });

    repo.holdSave(a.id);
    const renaming = s.rename(a.id, "First");
    await settle();

    repo.holdSave(a.id);
    const updating = s.update(a.id, { name: "Second" });
    await settle();
    expect(s.collection[0]?.name).toBe("Second");

    // Neither write reaches the repository, so "A" is still what it holds.
    // Rolling back to the displaced value would leave "First" on screen — a
    // name that was never saved.
    repo.pending(a.id).reject(new Error("save denied"));
    await expect(renaming).rejects.toThrow("save denied");
    repo.pending(a.id).reject(new Error("save denied"));
    await expect(updating).rejects.toThrow("save denied");

    expect(s.collection[0]?.name).toBe("A");
    expect(repo.saved.filter((e) => e.id === a.id)).toHaveLength(1);
  });

  it("restores the persisted entry when a rename and a delete both fail", async () => {
    const a = await s.add({ name: "A" });
    const b = await s.add({ name: "B" }); // [b, a]

    repo.holdSave(a.id);
    const renaming = s.rename(a.id, "Renamed");
    await settle();

    repo.holdRemove(a.id);
    const removing = s.remove(a.id);
    await settle();
    expect(s.collection.map((e) => e.id)).toEqual([b.id]);

    // Rename fails first, then the delete. The delete's rollback must not put
    // back the optimistic "Renamed" snapshot it happened to splice out.
    repo.pending(a.id).reject(new Error("save denied"));
    await expect(renaming).rejects.toThrow("save denied");
    repo.pending(a.id).reject(new Error("delete denied"));
    await expect(removing).rejects.toThrow("delete denied");

    expect(s.collection.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(s.collection.map((e) => e.name)).toEqual(["B", "A"]);
  });

  it("keeps a successfully saved edit when a later overlapping edit fails", async () => {
    const a = await s.add({ name: "A" });

    repo.holdSave(a.id);
    const renaming = s.rename(a.id, "First");
    await settle();

    repo.holdSave(a.id);
    const updating = s.update(a.id, { name: "Second" });
    await settle();

    // The first write lands; the second doesn't. "First" is what the
    // repository holds, so it is what the gallery must end up showing.
    repo.pending(a.id).resolve();
    await renaming;
    repo.pending(a.id).reject(new Error("save denied"));
    await expect(updating).rejects.toThrow("save denied");

    expect(s.collection[0]?.name).toBe("First");
  });

  it("keeps the newer edit when an older overlapping write fails", async () => {
    const a = await s.add({ name: "A" });

    repo.holdSave(a.id);
    const renaming = s.rename(a.id, "First");
    await settle();

    await s.update(a.id, { name: "Second" });
    expect(s.collection[0]?.name).toBe("Second");

    repo.pending(a.id).reject(new Error("save denied"));
    await expect(renaming).rejects.toThrow("save denied");

    expect(s.collection[0]?.name).toBe("Second");
  });
});

describe("CollectionState across identity changes", () => {
  let repo: ControllableRepo;
  let s: CollectionState<CollectionEntry>;

  const ownerEntry = { id: "shared", name: "A-art", createdAt: 1 };
  const otherEntry = { id: "shared", name: "B-art", createdAt: 2 };

  beforeEach(() => {
    repo = makeRepo();
    s = new CollectionState(
      repo,
      new LocalCollectionRepository("tka:test-identity", 1, makeStorage())
    );
    repo.remoteByUser.set("user-A", [{ ...ownerEntry }]);
    repo.remoteByUser.set("user-B", [{ ...otherEntry }]);
  });

  it("does not let a write held across a sign-out land in the next user's gallery", async () => {
    await s.init("user-A");

    repo.holdSave("shared");
    const renaming = s.rename("shared", "A-renamed");
    await settle();

    s.teardown();
    await s.init("user-B");
    expect(s.collection.map((e) => e.name)).toEqual(["B-art"]);

    // The previous user's write succeeds after the swap. It has no claim on
    // this user's list, and the ids happen to collide.
    repo.pending("shared").resolve();
    await renaming;

    expect(s.collection.map((e) => e.name)).toEqual(["B-art"]);
  });

  it("does not insert the previous user's entry into a gallery that has no such id", async () => {
    repo.remoteByUser.set("user-B", [
      { id: "b-only", name: "B-art", createdAt: 2 },
    ]);
    await s.init("user-A");

    repo.holdSave("shared");
    const renaming = s.rename("shared", "A-renamed");
    await settle();

    s.teardown();
    await s.init("user-B");

    repo.pending("shared").resolve();
    await renaming;

    // No id collision this time, so a stale settle appends rather than
    // replaces — the previous user's art showing up as an extra card.
    expect(s.collection.map((e) => e.id)).toEqual(["b-only"]);
  });

  it("does not remove the next user's entry when the previous user's write fails", async () => {
    await s.init("user-A");

    repo.holdSave("shared");
    const renaming = s.rename("shared", "A-renamed");
    await settle();

    s.teardown();
    await s.init("user-B");

    repo.pending("shared").reject(new Error("save denied"));
    await expect(renaming).rejects.toThrow("save denied");

    // Settling against a baseline cleared by teardown would have read as
    // "never persisted" and dropped the entry that is actually on screen.
    expect(s.collection.map((e) => e.name)).toEqual(["B-art"]);
  });

  it("does not let a slow load for the previous user paint over the current one", async () => {
    repo.holdLoad("user-A");
    const hydratingA = s.init("user-A");
    await settle();

    s.teardown();
    await s.init("user-B");
    expect(s.collection.map((e) => e.name)).toEqual(["B-art"]);

    repo.pendingLoad("user-A").resolve();
    await hydratingA;

    expect(s.collection.map((e) => e.name)).toEqual(["B-art"]);
    expect(s.loading).toBe(false);
  });

  it("keeps the current user's entry when a held delete from the previous one fails", async () => {
    await s.init("user-A");

    repo.holdRemove("shared");
    const removing = s.remove("shared");
    await settle();

    s.teardown();
    await s.init("user-B");

    repo.pending("shared").reject(new Error("delete denied"));
    await expect(removing).rejects.toThrow("delete denied");

    expect(s.collection.map((e) => e.name)).toEqual(["B-art"]);
  });
});

interface ArtEntry extends CollectionEntry {
  notes?: string;
  poster?: string;
}

describe("CollectionState update preparation", () => {
  let repo: ControllableRepo;

  beforeEach(() => {
    repo = makeRepo();
  });

  it("rebases a prepared update onto a rename that landed while it was preparing", async () => {
    const prepare = gateway();
    const prepared: CollectionEntry[] = [];
    const state = new CollectionState<ArtEntry>(
      repo as unknown as ControllableRepo & {
        load(userId: string): Promise<ArtEntry[]>;
      },
      new LocalCollectionRepository("tka:test-prepare", 1, makeStorage()),
      {
        async prepareUpdate(_previous, next) {
          prepared.push(next);
          await prepare.passed;
          // Enrichment the lifecycle owns: a regenerated poster.
          return { ...next, poster: "regenerated" };
        },
      }
    );

    repo.remoteByUser.set("user-1", [
      { id: "art", name: "Original", createdAt: 1 },
    ]);
    await state.init("user-1");

    const updating = state.update("art", { notes: "new choreography" });
    await settle();
    expect(prepared).toHaveLength(1);

    // A rename lands, and succeeds, while the poster is still regenerating.
    await state.rename("art", "Renamed");
    expect(state.collection[0]?.name).toBe("Renamed");

    prepare.open();
    const result = await updating;

    // Both edits succeeded, so both survive: the caller's patch, the
    // lifecycle's enrichment, and the name the rename persisted.
    expect(result).toMatchObject({
      id: "art",
      name: "Renamed",
      notes: "new choreography",
      poster: "regenerated",
    });
    expect(state.collection[0]).toMatchObject({
      name: "Renamed",
      notes: "new choreography",
      poster: "regenerated",
    });
    expect(repo.saved.at(-1)).toMatchObject({
      name: "Renamed",
      notes: "new choreography",
      poster: "regenerated",
    });
  });

  it("prepares one update at a time per entry, each from the last settled value", async () => {
    const releases: (() => void)[] = [];
    const preparedFrom: string[] = [];
    const state = new CollectionState<ArtEntry>(
      repo as unknown as ControllableRepo & {
        load(userId: string): Promise<ArtEntry[]>;
      },
      new LocalCollectionRepository("tka:test-serial", 1, makeStorage()),
      {
        async prepareUpdate(_previous, next) {
          // What this preparation is digesting. With two preparations running
          // at once, the second would digest a version without the first's
          // notes — content that was never the entry's actual state.
          preparedFrom.push(`${next.notes ?? "-"}/${next.poster ?? "-"}`);
          await new Promise<void>((resolve) => releases.push(resolve));
          return { ...next, poster: `poster-${preparedFrom.length}` };
        },
      }
    );

    repo.remoteByUser.set("user-1", [
      { id: "art", name: "Original", createdAt: 1 },
    ]);
    await state.init("user-1");

    const first = state.update("art", { notes: "one" });
    await settle();
    const second = state.update("art", { name: "Two" });
    await settle();

    // The second preparation has not started while the first is running.
    expect(preparedFrom).toEqual(["one/-"]);

    releases[0]?.();
    await first;
    await settle();

    // It starts only now, and sees the first update's result.
    expect(preparedFrom).toEqual(["one/-", "one/poster-1"]);
    releases[1]?.();
    await second;

    expect(state.collection[0]).toMatchObject({
      name: "Two",
      notes: "one",
      poster: "poster-2",
    });
  });

  it("drops a lifecycle-free update when the session ends before it commits", async () => {
    // Mandala, 3D scene and film collections register no lifecycle, so this is
    // the path every real consumer takes. The preparation queue is still
    // awaited, which is enough of a gap for a sign-out to land in.
    const state = new CollectionState<ArtEntry>(
      repo as unknown as ControllableRepo & {
        load(userId: string): Promise<ArtEntry[]>;
      },
      new LocalCollectionRepository("tka:test-nolifecycle", 1, makeStorage())
    );

    repo.remoteByUser.set("user-1", [
      { id: "art", name: "Original", createdAt: 1 },
    ]);
    repo.remoteByUser.set("user-2", [
      { id: "art", name: "Someone else's", createdAt: 2 },
    ]);
    await state.init("user-1");

    const updating = state.update("art", { notes: "new choreography" });
    // Synchronous teardown lands in the gap the awaited queue opens.
    state.teardown();
    await state.init("user-2");

    expect(await updating).toBeNull();
    expect(repo.savedBy.filter((s) => s.userId === "user-2")).toEqual([]);
    expect(state.collection).toEqual([
      { id: "art", name: "Someone else's", createdAt: 2 },
    ]);
  });

  it("does not block the next user's edit behind a preparation that never settles", async () => {
    const started: string[] = [];
    const stuck = gateway();
    const state = new CollectionState<ArtEntry>(
      repo as unknown as ControllableRepo & {
        load(userId: string): Promise<ArtEntry[]>;
      },
      new LocalCollectionRepository("tka:test-stuck", 1, makeStorage()),
      {
        async prepareUpdate(_previous, next) {
          started.push(next.name);
          // The first user's preparation is never released.
          if (started.length === 1) await stuck.passed;
          return next;
        },
      }
    );

    repo.remoteByUser.set("user-1", [
      { id: "art", name: "A-art", createdAt: 1 },
    ]);
    repo.remoteByUser.set("user-2", [
      { id: "art", name: "B-art", createdAt: 2 },
    ]);
    await state.init("user-1");

    void state.update("art", { notes: "abandoned" }).catch(() => undefined);
    await settle();
    expect(started).toEqual(["A-art"]);

    state.teardown();
    await state.init("user-2");

    // Same entry id, new identity: this must not queue behind the abandoned
    // preparation, which is never going to resolve.
    const result = await state.update("art", { notes: "mine" });
    expect(result).toMatchObject({ name: "B-art", notes: "mine" });
    expect(started).toEqual(["A-art", "B-art"]);
  });

  it("drops a prepared update when the session ends while it prepares", async () => {
    const prepare = gateway();
    const state = new CollectionState<ArtEntry>(
      repo as unknown as ControllableRepo & {
        load(userId: string): Promise<ArtEntry[]>;
      },
      new LocalCollectionRepository("tka:test-prepare-2", 1, makeStorage()),
      {
        async prepareUpdate(_previous, next) {
          await prepare.passed;
          return next;
        },
      }
    );

    repo.remoteByUser.set("user-1", [
      { id: "art", name: "Original", createdAt: 1 },
    ]);
    repo.remoteByUser.set("user-2", [
      { id: "art", name: "Someone else's", createdAt: 2 },
    ]);
    await state.init("user-1");

    const updating = state.update("art", { notes: "new choreography" });
    await settle();

    state.teardown();
    await state.init("user-2");

    prepare.open();
    expect(await updating).toBeNull();
    expect(state.collection).toEqual([
      { id: "art", name: "Someone else's", createdAt: 2 },
    ]);
    expect(repo.saved).toHaveLength(0);
  });
});
