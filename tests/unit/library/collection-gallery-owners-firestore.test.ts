import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A public collection can hold someone else's gallery sequence. Visitors can
 * only load it scoped to that person (word-derived ids collide across users),
 * so the owner's client has to record whose it is when it joins, forget it
 * when it leaves, and fill it in for collections saved before the map
 * existed. Missing any of these drops the sequence from every visitor's view
 * without an error.
 */

const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
  batchFetchPublicSequences: vi.fn(),
  batchFetchSequences: vi.fn(),
}));

function snapshot(path: string) {
  return {
    exists: () => mocks.store.has(path),
    data: () => mocks.store.get(path) ?? {},
  };
}

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(async (ref: { path: string }) => snapshot(ref.path)),
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(
    async (ref: { path: string }, data: Record<string, unknown>) => {
      mocks.writes.push({ path: ref.path, data });
    }
  ),
  query: vi.fn((value: unknown) => value),
  where: vi.fn(),
  documentId: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(
    async (_db: unknown, run: (transaction: unknown) => Promise<unknown>) =>
      run({
        get: async (ref: { path: string }) => snapshot(ref.path),
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          mocks.writes.push({ path: ref.path, data });
        },
      })
  ),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  writeBatch: vi.fn(),
  arrayRemove: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: vi.fn(),
}));
vi.mock("#lib/shared/library/services/collection-firestore-mapper.js", () => ({
  getAuthenticatedUserId: vi.fn(() => "owner"),
  mapDocToCollection: (data: Record<string, unknown>, id: string) => ({
    id,
    name: data["name"] ?? "",
    ownerId: "owner",
    kind: "manual",
    sequenceIds: data["sequenceIds"] ?? [],
    sequenceOwnerIds: data["sequenceOwnerIds"],
    galleryOwnerIds: data["galleryOwnerIds"],
    sequenceCount: (data["sequenceIds"] as string[] | undefined)?.length ?? 0,
    isPublic: data["isPublic"] ?? false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  batchFetchSequences: mocks.batchFetchSequences,
  batchFetchPublicSequences: mocks.batchFetchPublicSequences,
  filterExistingSequenceIds: vi.fn(),
  CollectionError: class extends Error {},
}));

import {
  addSequenceToCollection,
  getCollectionSequences,
  removeSequenceFromCollection,
} from "#lib/shared/library/services/collection-manager.js";
import { getUserCollectionSequences } from "#lib/features/library/services/public-collection-loader.js";

const COLLECTION = "users/owner/collections/set";

function collectionWrite() {
  return mocks.writes.filter((write) => write.path === COLLECTION).at(-1)?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.writes.length = 0;
  mocks.store.set("users/owner/sequences/mine", { visibility: "private" });
  mocks.store.set("publicSequences/saved", { ownerId: "someone" });
});

describe("owner-side gallery owner writes", () => {
  it("records whose gallery sequence was added", async () => {
    mocks.store.set(COLLECTION, { sequenceIds: ["mine"] });

    await addSequenceToCollection("set", "saved");

    expect(collectionWrite()).toMatchObject({
      sequenceIds: ["mine", "saved"],
      galleryOwnerIds: { saved: "someone" },
    });
  });

  it("writes no map for the owner's own sequence", async () => {
    mocks.store.set(COLLECTION, { sequenceIds: [] });

    await addSequenceToCollection("set", "mine");

    expect(collectionWrite()).not.toHaveProperty("galleryOwnerIds");
  });

  it("forgets the owner when the sequence leaves", async () => {
    mocks.store.set(COLLECTION, {
      sequenceIds: ["mine", "saved"],
      galleryOwnerIds: { saved: "someone" },
    });

    await removeSequenceFromCollection("set", "saved");

    expect(collectionWrite()).toMatchObject({
      sequenceIds: ["mine"],
      galleryOwnerIds: {},
    });
  });

  it("fills the map in when the owner opens an older collection", async () => {
    mocks.store.set(COLLECTION, { sequenceIds: ["mine", "saved"] });
    mocks.batchFetchSequences.mockResolvedValue([{ id: "mine" }]);
    mocks.batchFetchPublicSequences.mockResolvedValue([
      { id: "saved", ownerId: "someone" },
    ]);

    await getCollectionSequences("set");

    expect(collectionWrite()).toEqual({
      galleryOwnerIds: { saved: "someone" },
    });
  });
});

describe("visitor member loading", () => {
  it("loads each member scoped to the person whose mirror holds it", async () => {
    mocks.store.set(COLLECTION, {
      isPublic: true,
      sequenceIds: ["mine", "saved"],
      galleryOwnerIds: { saved: "someone" },
    });
    mocks.batchFetchPublicSequences.mockImplementation(
      async (_db: unknown, ids: string[]) => ids.map((id) => ({ id }))
    );

    const members = await getUserCollectionSequences("owner", "set");

    expect(mocks.batchFetchPublicSequences).toHaveBeenCalledWith(
      {},
      ["mine"],
      "owner"
    );
    expect(mocks.batchFetchPublicSequences).toHaveBeenCalledWith(
      {},
      ["saved"],
      "someone"
    );
    expect(members.map((member) => member.id).sort()).toEqual([
      "mine",
      "saved",
    ]);
  });
});
