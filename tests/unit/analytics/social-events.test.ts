import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: vi.fn(),
}));

vi.mock("#lib/shared/analytics/analytics-context.js", () => ({
  withRoute: (properties: Record<string, unknown>) => ({
    page: "/creators",
    ...properties,
  }),
}));

import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";
import {
  trackCollectionFollowChanged,
  trackCreatorProfileOpened,
  trackUserFollowChanged,
} from "#lib/shared/analytics/social-events.js";

describe("social decision events", () => {
  beforeEach(() => vi.mocked(captureWhenReady).mockClear());

  it("distinguishes creator follow and unfollow outcomes", () => {
    trackUserFollowChanged("follow", "creator_directory", "creator-1");
    trackUserFollowChanged("unfollow", "creator_profile", "creator-2");

    expect(vi.mocked(captureWhenReady).mock.calls).toEqual([
      [
        "user_follow",
        {
          page: "/creators",
          source: "creator_directory",
          target_user_id: "creator-1",
        },
      ],
      [
        "user_unfollow",
        {
          page: "/creators",
          source: "creator_profile",
          target_user_id: "creator-2",
        },
      ],
    ]);
  });

  it("captures collection relationships and profile discovery with bounded properties", () => {
    trackCollectionFollowChanged(
      "follow",
      "community_collection",
      "owner-1",
      "collection-1"
    );
    trackCollectionFollowChanged(
      "unfollow",
      "followed_collection",
      "owner-2",
      "collection-2"
    );
    trackCreatorProfileOpened("community_map", "creator-3");

    expect(vi.mocked(captureWhenReady).mock.calls).toEqual([
      [
        "collection_followed",
        {
          page: "/creators",
          source: "community_collection",
          owner_id: "owner-1",
          collection_id: "collection-1",
        },
      ],
      [
        "collection_unfollowed",
        {
          page: "/creators",
          source: "followed_collection",
          owner_id: "owner-2",
          collection_id: "collection-2",
        },
      ],
      [
        "creator_profile_opened",
        {
          page: "/creators",
          source: "community_map",
          target_user_id: "creator-3",
        },
      ],
    ]);
  });
});
