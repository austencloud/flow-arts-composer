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

import { createCreatorsDataState } from "#lib/features/creators/state/creators-data-state.svelte.js";
import { applyOwnCreatorVisibility } from "#lib/features/creators/state/own-creator-visibility.js";
import { createCachedLoad } from "#lib/features/community/services/public-locations-cache.js";

function person(id: string) {
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
  } as EnhancedUserProfile;
}

describe("the Show me in Creators switch", () => {
  it("takes the person off the loaded roster and back, and re-reads the pins", async () => {
    h.getUsersPaginated.mockResolvedValueOnce({
      users: [person("me"), person("other")],
      lastDocSnapshot: null,
      hasMore: false,
    });
    const roster = createCreatorsDataState();
    await roster.loadCreators();

    const loadPins = vi.fn(async () => ["pin"]);
    const pins = createCachedLoad(loadPins);
    await pins.get();
    await pins.get();
    expect(loadPins).toHaveBeenCalledTimes(1);

    const targets = {
      patchUser: roster.patchUser,
      invalidatePins: pins.invalidate,
    };

    applyOwnCreatorVisibility("me", true, targets);
    expect(roster.users.map((u) => u.id)).toEqual(["other"]);
    await pins.get();
    expect(loadPins).toHaveBeenCalledTimes(2);

    applyOwnCreatorVisibility("me", false, targets);
    expect(roster.users.map((u) => u.id)).toEqual(["me", "other"]);
    await pins.get();
    expect(loadPins).toHaveBeenCalledTimes(3);
  });
});
