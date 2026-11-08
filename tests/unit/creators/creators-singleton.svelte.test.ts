// @vitest-environment jsdom
import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
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

import { creatorsDataState } from "#lib/features/creators/state/creators-data-state.svelte.js";

function person(id: string, displayName: string) {
  return {
    id,
    username: id,
    displayName,
    publicProfileVersion: 2,
    sequenceCount: 0,
    collectionCount: 0,
    followerCount: 0,
    followingCount: 0,
    joinedDate: new Date(0),
    isFollowing: false,
    isFeatured: false,
  } as unknown as EnhancedUserProfile;
}

describe("the shared Creators state", () => {
  // The panel's first read of the singleton happens inside one of its own
  // $derived values. The state's derived values must not belong to that
  // reader, or they detach when it recomputes and search stops reaching the
  // page (the 2026-11 "search does nothing" bug).
  it("keeps search live for a component that first read it inside a derived", async () => {
    h.getUsersPaginated.mockResolvedValueOnce({
      users: [person("m1", "Morgan Cloud"), person("m2", "Melody")],
      lastDocSnapshot: null,
      hasMore: false,
    });

    let shown: number | null = -1;
    let listed = 0;
    const cleanup = $effect.root(() => {
      const users = $derived(creatorsDataState.users);
      const results = $derived(creatorsDataState.searchResults);
      $effect(() => {
        listed = users.length;
      });
      $effect(() => {
        shown = results === null ? null : results.length;
      });
    });

    flushSync();
    await creatorsDataState.loadCreators();
    flushSync();
    expect(listed).toBe(2);
    expect(shown).toBeNull();

    creatorsDataState.setSearchQuery("morg");
    flushSync();
    expect(shown).toBe(1);

    creatorsDataState.setSearchQuery("");
    flushSync();
    expect(shown).toBeNull();
    cleanup();
  });
});
