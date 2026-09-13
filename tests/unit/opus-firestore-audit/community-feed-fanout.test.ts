/**
 * Community collections feed — per-snapshot operation census.
 *
 * Executable evidence for the Firestore cost audit
 * (docs/reports/opus-batch-2026-09-12/firestore-cost.md, findings H1 and H3).
 *
 * READ-ONLY AUDIT ARTEFACT. Every number asserted here is what production does
 * TODAY. The numbers are the point: they turn "this feels expensive" into a
 * measured operation count that a fix can be graded against.
 *
 * The call chain under measurement:
 *
 *   BrowseModule.onMount / CollectionChipsRow / CommunityCollectionsPanel
 *     -> communityCollectionsState.ensureLoaded()
 *        -> subscribeToAllPublicCollections()          [collectionGroup, limit 200]
 *           -> per CHANGED doc: mapPublicCollectionDoc -> toPublicView
 *              -> countPublicMembers -> getCountFromServer per 30-id chunk
 *        -> applySnapshot() -> getVisibleOwnerNames()   [users `in` query per 30 uids]
 *
 * Two amplifiers live in that chain:
 *
 *   H1  getVisibleOwnerNames() runs on EVERY snapshot with no memo, so one
 *       remote write to one public collection re-reads every distinct owner
 *       profile in the feed window.
 *   H3  invalidate() tears the listener down and re-attaches it after a LOCAL
 *       mutation the live listener was already going to deliver, paying the
 *       full cold-attach cost a second time.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  /** Aggregate count queries issued by countPublicMembers(). */
  countQueries: [] as { ownerId: string; ids: string[] }[],
  /** `documentId() in [...]` chunks passed to the users collection. */
  ownerNameChunks: [] as string[][],
  /** Live onSnapshot callback for the collectionGroup query. */
  emit: null as ((snap: unknown) => void) | null,
  attachCount: 0,
  unsubscribeCount: 0,
  pendingWhereIn: null as string[] | null,
  pendingOwnerId: null as string | null,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  collectionGroup: vi.fn((_db: unknown, id: string) => ({ path: id })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  documentId: vi.fn(() => "__name__"),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ forEach: () => {}, docs: [], size: 0 })),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => [ref, ...clauses]),
  where: vi.fn((field: unknown, op: string, value: unknown) => {
    if (op === "in") mocks.pendingWhereIn = value as string[];
    if (field === "ownerId" && op === "==") mocks.pendingOwnerId = value as string;
    return { field, op, value };
  }),
  getCountFromServer: vi.fn(async () => {
    mocks.countQueries.push({
      ownerId: mocks.pendingOwnerId ?? "",
      ids: mocks.pendingWhereIn ?? [],
    });
    mocks.pendingOwnerId = null;
    mocks.pendingWhereIn = null;
    // Every member is public, so the count matches and toPublicView returns
    // the collection unchanged — the cheapest possible outcome. The operation
    // count measured here is therefore a FLOOR.
    return { data: () => ({ count: 0 }) };
  }),
  onSnapshot: vi.fn((_q: unknown, onNext: (snap: unknown) => void) => {
    mocks.attachCount++;
    mocks.emit = onNext;
    return () => {
      mocks.unsubscribeCount++;
    };
  }),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("$lib/shared/library/services/collection-firestore-mapper", () => ({
  mapDocToCollection: (data: Record<string, unknown>, id: string) => ({
    id,
    ...data,
  }),
  getAuthenticatedUserId: vi.fn(() => "viewer"),
  batchFetchSequences: vi.fn(),
  batchFetchPublicSequences: vi.fn(),
}));

// Real batching logic, instrumented: mirrors user-repository.getVisibleOwnerNames
// (30-uid `in` chunks over the users collection, 1 billed read per matched doc).
vi.mock("$lib/shared/community/services/user-repository", () => ({
  getVisibleOwnerNames: vi.fn(async (userIds: string[]) => {
    const unique = [...new Set(userIds)].filter(Boolean);
    const names = new Map<string, string>();
    for (let i = 0; i < unique.length; i += 30) {
      const chunk = unique.slice(i, i + 30);
      mocks.ownerNameChunks.push(chunk);
      for (const uid of chunk) names.set(uid, `name-${uid}`);
    }
    return names;
  }),
}));

import { communityCollectionsState } from "$lib/features/browse/collections/state/community-collections-state.svelte";

/** A collection-group doc at users/{owner}/collections/{id}. */
function collectionDoc(
  ownerId: string,
  id: string,
  memberCount: number
): Record<string, unknown> {
  const ref = {
    path: `users/${ownerId}/collections/${id}`,
    parent: { parent: { id: ownerId } },
  };
  return {
    id,
    ref,
    data: () => ({
      name: id,
      isPublic: true,
      sequenceIds: Array.from({ length: memberCount }, (_, i) => `${id}-seq-${i}`),
      sequenceCount: memberCount,
    }),
  };
}

function snapshot(
  docs: Record<string, unknown>[],
  changed: Record<string, unknown>[]
) {
  return {
    size: docs.length,
    docs,
    docChanges: () =>
      changed.map((d) => ({ type: "modified" as const, doc: d })),
  };
}

/** Drain the promise chains inside applySnapshot / toPublicView. */
async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
}

function resetCounters(): void {
  mocks.countQueries.length = 0;
  mocks.ownerNameChunks.length = 0;
  mocks.attachCount = 0;
  mocks.unsubscribeCount = 0;
}

beforeEach(() => {
  communityCollectionsState.teardown();
  resetCounters();
  mocks.emit = null;
});

describe("cold attach cost of the community collections feed", () => {
  it("charges one count query per 30 members of every collection in the window", async () => {
    // 40 public collections, 45 members each -> 2 chunks per collection.
    const docs = Array.from({ length: 40 }, (_, i) =>
      collectionDoc(`owner-${i % 10}`, `col-${i}`, 45)
    );

    await communityCollectionsState.ensureLoaded();
    await settle();

    mocks.emit!(snapshot(docs, docs)); // initial snapshot: every doc is a change
    await settle();

    // 40 collection docs downloaded by the listener, plus the normalization tax:
    expect(mocks.countQueries).toHaveLength(80); // 40 collections x ceil(45/30)

    // Owner names: 10 distinct owners -> 1 chunked `in` query, 10 billed reads.
    expect(mocks.ownerNameChunks).toEqual([
      Array.from({ length: 10 }, (_, i) => `owner-${i}`),
    ]);

    expect(communityCollectionsState.items).toHaveLength(40);
  });
});

describe("H1 — one remote write re-reads every owner profile in the window", () => {
  it("re-runs getVisibleOwnerNames on a snapshot where only one doc changed", async () => {
    const docs = Array.from({ length: 40 }, (_, i) =>
      collectionDoc(`owner-${i % 10}`, `col-${i}`, 45)
    );

    await communityCollectionsState.ensureLoaded();
    await settle();
    mocks.emit!(snapshot(docs, docs));
    await settle();
    resetCounters();

    // Somebody, anywhere, renames ONE public collection. This is a
    // collectionGroup listener over all public collections, so every signed-in
    // client with the feed attached receives this snapshot.
    mocks.emit!(snapshot(docs, [docs[7]!]));
    await settle();

    // Correct and already optimised: normalization is memoised per document
    // path, so only the changed doc is re-counted.
    expect(mocks.countQueries).toHaveLength(2); // ceil(45/30) for col-7 only

    // DEFECT PINNED (H1): the owner-name pass is NOT memoised. All 10 distinct
    // owner profiles are re-read for a change that touched one collection
    // owned by one of them. Expect `toHaveLength(0)` once applySnapshot only
    // resolves owners it has not already resolved.
    expect(mocks.ownerNameChunks).toHaveLength(1);
    expect(mocks.ownerNameChunks[0]).toHaveLength(10);
  });

  it("scales the re-read with distinct owners, not with what changed", async () => {
    // Same 40 collections, now spread over 35 owners instead of 10.
    const docs = Array.from({ length: 40 }, (_, i) =>
      collectionDoc(`owner-${i % 35}`, `col-${i}`, 1)
    );

    await communityCollectionsState.ensureLoaded();
    await settle();
    mocks.emit!(snapshot(docs, docs));
    await settle();
    resetCounters();

    mocks.emit!(snapshot(docs, [docs[0]!]));
    await settle();

    // 35 owners -> 2 `in` chunks, 35 billed user-document reads, for a
    // single-document change. This is the amplification factor.
    const reReadOwners = mocks.ownerNameChunks.flat();
    expect(reReadOwners).toHaveLength(35);
    expect(mocks.ownerNameChunks).toHaveLength(2); // ceil(35/30)
  });
});

describe("H3 — invalidate() pays the cold-attach cost for a local mutation", () => {
  it("detaches and re-attaches the listener, re-counting every collection", async () => {
    const docs = Array.from({ length: 40 }, (_, i) =>
      collectionDoc(`owner-${i % 10}`, `col-${i}`, 45)
    );

    await communityCollectionsState.ensureLoaded();
    await settle();
    mocks.emit!(snapshot(docs, docs));
    await settle();
    resetCounters();

    // CollectionCard / CollectionDetailView / CollectionDetailsDialog call
    // invalidate() after a rename, a visibility toggle, or a delete.
    communityCollectionsState.invalidate();
    await settle();
    mocks.emit!(snapshot(docs, docs)); // fresh listener => every doc is "added"
    await settle();

    expect(mocks.unsubscribeCount).toBe(1);
    expect(mocks.attachCount).toBe(1);

    // DEFECT PINNED (H3): the per-document normalization memo died with the
    // old subscription, so all 40 collections are re-counted and all 40 docs
    // re-downloaded — for a mutation the surviving listener would have
    // delivered as a single docChange.
    expect(mocks.countQueries).toHaveLength(80);
    expect(mocks.ownerNameChunks.flat()).toHaveLength(10);
  });
});

describe("listener lifetime", () => {
  it("has no production caller that ever tears the feed listener down", async () => {
    // `communityCollectionsState.teardown()` exists but is called from nowhere
    // in src/ (ensureLoaded and invalidate are the only production entry
    // points). The collectionGroup listener therefore outlives sign-out and
    // every navigation away from Browse, for the lifetime of the tab.
    //
    // This assertion documents the *shape* — that invalidate() is the only
    // path that ever unsubscribes, and it immediately resubscribes. The
    // "never called from src/" claim itself is verified by grep in the audit
    // report, not here.
    await communityCollectionsState.ensureLoaded();
    await settle();
    expect(mocks.attachCount).toBe(1);

    communityCollectionsState.invalidate();
    await settle();
    expect(mocks.unsubscribeCount).toBe(1);
    expect(mocks.attachCount).toBe(2); // straight back up — never a net zero
  });
});
