import { withRoute } from "#lib/shared/analytics/analytics-context.js";
import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";

export type UserFollowSource = "creator_directory" | "creator_profile";

export type CreatorProfileSource =
  | "browse_collections"
  | "community_map"
  | "creator_connection"
  | "creator_directory"
  | "direct_link"
  | "history"
  | "inbox_notification"
  | "sequence_viewer";

export type CollectionFollowSource =
  | "community_collection"
  | "followed_collection";

export function trackUserFollowChanged(
  action: "follow" | "unfollow",
  source: UserFollowSource,
  targetUserId: string
): void {
  captureWhenReady(action === "follow" ? "user_follow" : "user_unfollow", {
    ...withRoute({ source }),
    target_user_id: targetUserId,
  });
}

export function trackCollectionFollowChanged(
  action: "follow" | "unfollow",
  source: CollectionFollowSource,
  ownerId: string,
  collectionId: string
): void {
  captureWhenReady(
    action === "follow" ? "collection_followed" : "collection_unfollowed",
    {
      ...withRoute({ source }),
      owner_id: ownerId,
      collection_id: collectionId,
    }
  );
}

export function trackCreatorProfileOpened(
  source: CreatorProfileSource,
  targetUserId: string
): void {
  captureWhenReady("creator_profile_opened", {
    ...withRoute({ source }),
    target_user_id: targetUserId,
  });
}
