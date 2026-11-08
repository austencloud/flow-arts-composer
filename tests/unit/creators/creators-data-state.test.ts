import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

const h = vi.hoisted(() => ({
  getUsersPaginated: vi.fn(),
  getFeaturedCreators: vi.fn(async () => []),
}));

vi.mock("#lib/shared/community/services/user-repository.js", () => ({
  getUsersPaginated: h.getUsersPaginated,
  getFeaturedCreators: h.getFeaturedCreators,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  isEffectiveAdmin: () => false,
}));

import { createCreatorsDataState } from "#lib/features/creators/state/creators-data-state.svelte.js";

function person(id: string, overrides: Partial<EnhancedUserProfile> = {}) {
  return {
    id,
    username: id,
    displayName: id,
    sequenceCount: 0,
    collectionCount: 0,
    followerCount: 0,
    followingCount: 0,
    joinedDate: new Date(0),
    isFollowing: false,
    isFeatured: false,
    ...overrides,
  } as EnhancedUserProfile;
}

const cursor = (id: string) => ({ id }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Show more", () => {
  it("appends the next page after the cursor and stops when there is no more", async () => {
    h.getUsersPaginated
      .mockResolvedValueOnce({
        users: [person("a"), person("b")],
        lastDocSnapshot: cursor("b"),
        hasMore: true,
      })
      .mockResolvedValueOnce({
        // "b" moved across the cursor between pages; it is not shown twice.
        users: [person("b"), person("c")],
        lastDocSnapshot: cursor("c"),
        hasMore: false,
      });
    const state = createCreatorsDataState();

    await state.loadCreators();
    expect(state.hasMore).toBe(true);
    await state.loadMoreCreators();

    expect(h.getUsersPaginated).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: cursor("b") }),
      undefined
    );
    expect(state.users.map((user) => user.id)).toEqual(["a", "b", "c"]);
    expect(state.hasMore).toBe(false);

    await state.loadMoreCreators();
    expect(h.getUsersPaginated).toHaveBeenCalledTimes(2);
  });

  it("keeps the loaded roster and allows another try when a page fails", async () => {
    h.getUsersPaginated
      .mockResolvedValueOnce({
        users: [person("a")],
        lastDocSnapshot: cursor("a"),
        hasMore: true,
      })
      .mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = createCreatorsDataState();

    await state.loadCreators();
    await state.loadMoreCreators();

    expect(state.users.map((user) => user.id)).toEqual(["a"]);
    expect(state.error).toBeNull();
    expect(state.hasMore).toBe(true);
    expect(state.isLoadingMore).toBe(false);
  });
});

describe("follow state belongs to one viewer", () => {
  function page(users: EnhancedUserProfile[]) {
    return { users, lastDocSnapshot: null, hasMore: false };
  }

  it("drops the old viewer's follows at once and loads the new viewer's", async () => {
    h.getUsersPaginated
      .mockResolvedValueOnce(page([person("x", { isFollowing: true })]))
      .mockResolvedValueOnce(page([person("x", { isFollowing: false })]));
    const state = createCreatorsDataState();
    await state.loadCreators("viewer-a");
    expect(state.followStateFor).toBe("viewer-a");

    const switching = state.syncViewer("viewer-b");
    // Before B's follows arrive, nothing shows A's.
    expect(state.users[0].isFollowing).toBe(false);
    await switching;

    expect(h.getUsersPaginated).toHaveBeenLastCalledWith(
      expect.anything(),
      "viewer-b"
    );
    expect(state.followStateFor).toBe("viewer-b");
  });

  it("signing out clears follows without a reload", async () => {
    h.getUsersPaginated.mockResolvedValueOnce(
      page([person("x", { isFollowing: true })])
    );
    const state = createCreatorsDataState();
    await state.loadCreators("viewer-a");

    await state.syncViewer(null);

    expect(state.users[0].isFollowing).toBe(false);
    expect(state.followStateFor).toBeNull();
    expect(h.getUsersPaginated).toHaveBeenCalledTimes(1);
  });

  it("a viewer change during a load is applied once that load lands", async () => {
    let finishFirst: (value: unknown) => void = () => undefined;
    h.getUsersPaginated
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      )
      .mockResolvedValueOnce(page([person("x", { isFollowing: false })]));
    const state = createCreatorsDataState();
    const first = state.loadCreators("viewer-a");
    void state.syncViewer("viewer-b");

    finishFirst(page([person("x", { isFollowing: true })]));
    await first;

    expect(state.followStateFor).toBe("viewer-b");
    expect(state.users[0].isFollowing).toBe(false);
  });

  it("a follow made on a profile reaches the roster row and the Following list", async () => {
    h.getUsersPaginated.mockResolvedValueOnce(
      page([person("x", { followerCount: 4 }), person("y")])
    );
    const state = createCreatorsDataState();
    await state.loadCreators("viewer-a");

    state.applyFollowChange("x", true);

    expect(state.users.find((user) => user.id === "x")).toMatchObject({
      isFollowing: true,
      followerCount: 5,
    });
    expect(state.users.filter((user) => user.isFollowing).map((u) => u.id)).toEqual(
      ["x"]
    );
  });

  it("a second press on a stale button does not count the follow twice", async () => {
    h.getUsersPaginated.mockResolvedValueOnce(
      page([person("x", { followerCount: 4 })])
    );
    const state = createCreatorsDataState();
    await state.loadCreators("viewer-a");

    state.applyFollowChange("x", true);
    state.applyFollowChange("x", true);

    expect(state.users[0].followerCount).toBe(5);
  });
});

describe("search", () => {
  it("narrows the roster to matching creators and clears back to all", async () => {
    h.getUsersPaginated.mockResolvedValueOnce({
      users: [
        person("m1", { displayName: "Morgan Cloud", publicProfileVersion: 2 } as never),
        person("m2", { displayName: "Melody", publicProfileVersion: 2 } as never),
      ],
      lastDocSnapshot: cursor("m2"),
      hasMore: false,
    });
    const state = createCreatorsDataState();
    await state.loadCreators();
    expect(state.users).toHaveLength(2);

    state.setSearchQuery("morg");
    expect(state.searchResults?.map((user) => user.id)).toEqual(["m1"]);

    state.setSearchQuery("");
    expect(state.searchResults).toBeNull();
  });
});
