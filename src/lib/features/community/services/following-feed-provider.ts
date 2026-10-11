/**
 * Following Feed Provider
 *
 * Aggregates activity from users that the current user follows.
 * Queries activity logs and favorites from followed users to build a personalized feed.
 */

import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { getFollowing } from "#lib/shared/community/services/user-repository.js";
import { queryEvents } from "#lib/shared/analytics/services/posthog-activity-logger.js";
import type {
  FollowingFeedItem, FollowingFeedOptions } from "./types";
import type { ActivityEvent } from "#lib/shared/analytics/domain/models/activity-event.js";
import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

export async function getFollowingFeed(
  options: FollowingFeedOptions = {}
): Promise<FollowingFeedItem[]> {
  const { limit = 10, daysBack = 7, eventTypes, userId } = options;

  const effectiveUserId = userId || authState.user?.uid;

  if (!effectiveUserId) {
    return [];
  }

  try {
    const followedUsers = await getFollowing(effectiveUserId, 100);

    if (followedUsers.length === 0) {
      return [];
    }

    const userMap = new Map<string, UserProfile>();
    for (const user of followedUsers) {
      userMap.set(user.id, user);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const allItems: FollowingFeedItem[] = [];

    const activityPromises = followedUsers.map(async (user) => {
      const events = await queryEvents({
        userId: user.id,
        startDate,
        limit: 20,
        orderDirection: "desc",
      });

      const relevantEvents = events.filter((event) => {
        const isRelevantType =
          event.eventType === "sequence_create" ||
          event.eventType === "sequence_favorite";

        if (!isRelevantType) return false;

        if (eventTypes && eventTypes.length > 0) {
          return eventTypes.includes(
            event.eventType as FollowingFeedItem["eventType"]
          );
        }

        return true;
      });

      return relevantEvents.map((event) =>
        activityEventToFeedItem(event, user)
      );
    });

    const activityResults = await Promise.all(activityPromises);
    for (const items of activityResults) {
      allItems.push(...items);
    }

    allItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return allItems.slice(0, limit);
  } catch (error) {
    console.error("[following-feed-provider] Error getting feed:", error);
    // A fetch failure is not an empty feed. Propagate so callers can render an
    // error state instead of an indistinguishable "no activity" view.
    throw error instanceof Error
      ? error
      : new Error("Failed to load following feed.");
  }
}

export async function hasFollowing(userId?: string): Promise<boolean> {
  const count = await getFollowingCount(userId);
  return count > 0;
}

export async function getFollowingCount(userId?: string): Promise<number> {
  const effectiveUserId = userId || authState.user?.uid;

  if (!effectiveUserId) {
    return 0;
  }

  try {
    const followedUsers = await getFollowing(effectiveUserId, 1);
    return followedUsers.length;
  } catch (error) {
    console.error(
      "[following-feed-provider] Error getting following count:",
      error
    );
    // Propagate rather than report a false zero; callers decide how to surface.
    throw error instanceof Error
      ? error
      : new Error("Failed to load following count.");
  }
}

function activityEventToFeedItem(
  event: ActivityEvent,
  user: UserProfile
): FollowingFeedItem {
  const base: FollowingFeedItem = {
    id: event.id ?? `${event.userId}-${event.timestamp.getTime()}`,
    userId: event.userId,
    userDisplayName: user.displayName || user.username || "Anonymous",
    userAvatarUrl: user.avatar,
    eventType: event.eventType as FollowingFeedItem["eventType"],
    timestamp: event.timestamp,
  };

  if (
    event.eventType === "sequence_create" ||
    event.eventType === "sequence_favorite"
  ) {
    if (event.metadata?.sequenceId) {
      base.sequenceId = event.metadata.sequenceId;
      base.sequenceWord = event.metadata.sequenceWord as string | undefined;
    }
  }

  return base;
}
