import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";

// The feed used to be only what the cross-user listener delivered, so a
// collection you had just made public was missing from Explore > Collections
// until the server round trip, count normalization, and owner lookup all
// finished. These tests pin the fill-in from your own library state.

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  feedCallback: null as
    | ((items: { collection: LibraryCollection; ownerId: string }[]) => void)
    | null,
  unsubscribe: vi.fn(),
  getVisibleOwnerNames: vi.fn(),
  authState: {
    effectiveUserId: "me" as string | null,
    user: { uid: "me", displayName: "Austen Cloud" } as {
      uid: string;
      displayName: string | null;
    } | null,
  },
  collectionsState: { collections: [] as LibraryCollection[] },
}));

vi.mock("#lib/features/library/services/public-collection-loader.js", () => ({
  subscribeToAllPublicCollections: mocks.subscribe,
}));
vi.mock("#lib/shared/community/services/user-repository.js", () => ({
  getVisibleOwnerNames: mocks.getVisibleOwnerNames,
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: mocks.authState,
}));
vi.mock("#lib/features/library/state/collections-state.svelte.js", () => ({
  collectionsState: mocks.collectionsState,
}));

import {
  communityCollectionsState,
  withOwnPublicCollections,
  type CommunityCollection,
} from "../community-collections-state.svelte";

function col(
  id: string,
  opts: Partial<LibraryCollection> = {}
): LibraryCollection {
  return {
    id,
    name: id.toUpperCase(),
    ownerId: "me",
    sequenceIds: ["a"],
    sequenceCount: 1,
    isPublic: true,
    sortOrder: 0,
    icon: "fa-folder",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...opts,
  };
}

function feedItem(
  id: string,
  ownerId: string,
  opts: Partial<LibraryCollection> = {}
): CommunityCollection {
  return {
    collection: col(id, { ownerId, ...opts }),
    ownerId,
    ownerName: ownerId === "me" ? "Austen Cloud" : "Someone Else",
  };
}

const me = { id: "me", name: "Austen Cloud" };

describe("withOwnPublicCollections", () => {
  it("adds the viewer's public collections the feed has not delivered yet", () => {
    const feed = [feedItem("theirs", "them")];
    const own = [col("mine"), col("private", { isPublic: false })];

    const items = withOwnPublicCollections(feed, own, me);

    expect(items.map((item) => item.collection.id)).toEqual(["theirs", "mine"]);
    expect(items[1]).toMatchObject({
      ownerId: "me",
      ownerName: "Austen Cloud",
    });
  });

  it("lets the feed's copy win once it lands (it carries the public count)", () => {
    const feed = [feedItem("mine", "me", { sequenceCount: 1 })];
    const own = [col("mine", { sequenceCount: 4 })];

    const items = withOwnPublicCollections(feed, own, me);

    expect(items).toHaveLength(1);
    expect(items[0]?.collection.sequenceCount).toBe(1);
  });

  it("skips system and smart collections, which the feed never shows", () => {
    const own = [
      col("favorites", { systemType: "favorites" }),
      col("smart", { kind: "smart" }),
      col("manual", { kind: "manual" }),
    ];

    const items = withOwnPublicCollections([], own, me);

    expect(items.map((item) => item.collection.id)).toEqual(["manual"]);
  });

  it("keeps newest-first order when weaving own collections in", () => {
    const feed = [
      feedItem("newest", "them", { updatedAt: new Date(3000) }),
      feedItem("oldest", "them", { updatedAt: new Date(1000) }),
    ];
    const own = [col("mine", { updatedAt: new Date(2000) })];

    const items = withOwnPublicCollections(feed, own, me);

    expect(items.map((item) => item.collection.id)).toEqual([
      "newest",
      "mine",
      "oldest",
    ]);
  });

  it("returns the feed untouched for a signed-out viewer", () => {
    const feed = [feedItem("theirs", "them")];
    expect(withOwnPublicCollections(feed, [col("mine")], null)).toBe(feed);
  });
});

describe("communityCollectionsState.items", () => {
  beforeEach(() => {
    communityCollectionsState.teardown();
    vi.clearAllMocks();
    mocks.feedCallback = null;
    mocks.collectionsState.collections = [];
    mocks.authState.effectiveUserId = "me";
    mocks.subscribe.mockImplementation((callback) => {
      mocks.feedCallback = callback;
      return mocks.unsubscribe;
    });
    mocks.getVisibleOwnerNames.mockResolvedValue(
      new Map([
        ["me", "Austen Cloud"],
        ["them", "Someone Else"],
      ])
    );
  });

  it("shows a just-published collection before the listener reports it", async () => {
    // "Make public" flipped the flag in library state; the feed has not
    // delivered anything yet (the mock stands in for the live library, so it
    // is set before the first read rather than mutated under a $derived).
    mocks.collectionsState.collections = [
      col("mine", { updatedAt: new Date(5000) }),
    ];
    await communityCollectionsState.ensureLoaded();

    expect(communityCollectionsState.loading).toBe(true);
    expect(communityCollectionsState.items.map((i) => i.collection.id)).toEqual(
      ["mine"]
    );
    expect(communityCollectionsState.items[0]?.ownerName).toBe("Austen Cloud");

    mocks.feedCallback?.([
      { collection: col("theirs", { ownerId: "them" }), ownerId: "them" },
    ]);
    await vi.waitFor(() =>
      expect(communityCollectionsState.loading).toBe(false)
    );

    expect(communityCollectionsState.items.map((i) => i.collection.id)).toEqual(
      ["mine", "theirs"]
    );
  });

  it("drops the fill-in once the listener delivers the normalized copy", async () => {
    mocks.collectionsState.collections = [col("mine", { sequenceCount: 3 })];
    await communityCollectionsState.ensureLoaded();
    expect(communityCollectionsState.items[0]?.collection.sequenceCount).toBe(
      3
    );

    mocks.feedCallback?.([
      { collection: col("mine", { sequenceCount: 1 }), ownerId: "me" },
    ]);
    await vi.waitFor(() =>
      expect(communityCollectionsState.items[0]?.collection.sequenceCount).toBe(
        1
      )
    );
    expect(communityCollectionsState.items).toHaveLength(1);
  });
});
