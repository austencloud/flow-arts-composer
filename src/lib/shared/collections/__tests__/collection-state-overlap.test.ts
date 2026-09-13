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
 * A repository whose writes can be held open per entry id. `holdSave("x")`
 * makes the next `save` of entry `x` block until the test resolves or rejects
 * it; every other write completes immediately.
 */
interface ControllableRepo extends FirebaseCollectionRepository<CollectionEntry> {
  saved: CollectionEntry[];
  removed: string[];
  holdSave(id: string): void;
  holdRemove(id: string): void;
  pending(id: string): Deferred;
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

  const repo: ControllableRepo = {
    async load() {
      return [];
    },
    async save(_uid, entry) {
      await gate(entry.id);
      repo.saved.push(entry);
    },
    async remove(_uid, id) {
      await gate(id);
      repo.removed.push(id);
    },
    saved: [],
    removed: [],
    holdSave: hold,
    holdRemove: hold,
    // Oldest first, so a test settles held writes in the order they were made.
    pending: (id) => {
      const deferred = pending.get(id)?.shift();
      if (!deferred) throw new Error(`no write held for ${id}`);
      return deferred;
    },
  };
  return repo;
}

/** Let the microtask queue drain so a held write's rejection propagates. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
