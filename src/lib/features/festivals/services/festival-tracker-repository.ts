/**
 * festival-tracker-repository
 *
 * Persists each user's per-festival tracking state - application status,
 * workshops submitted, notes, and key dates - in a user-owned subcollection.
 *
 * Path: userFestivalTracking/{userId}/tracked/{festivalId}
 */

import { firestoreGet, firestoreList, firestoreSet, firestoreDelete } from "#lib/shared/firestore/index.js";
import { UserFestivalTrackerSchema } from "../domain/models/festival-tracker-schemas";
import type { UserFestivalTracker } from "../domain/models/festival-tracker";
import {
  trackFestivalTrackerChanged,
  trackFestivalTrackerRemoved,
} from "../analytics/festival-events";

function trackedPath(userId: string): string {
  return `userFestivalTracking/${userId}/tracked`;
}

export async function get(userId: string, festivalId: string): Promise<UserFestivalTracker | null> {
  return firestoreGet(trackedPath(userId), festivalId, UserFestivalTrackerSchema) as Promise<UserFestivalTracker | null>;
}

export async function getAllForUser(userId: string): Promise<Map<string, UserFestivalTracker>> {
  const items = await firestoreList(trackedPath(userId), UserFestivalTrackerSchema);
  const result = new Map<string, UserFestivalTracker>();
  for (const item of items) {
    result.set(item.festivalId, item as unknown as UserFestivalTracker);
  }
  return result;
}

export async function set(
  userId: string,
  festivalId: string,
  data: Partial<UserFestivalTracker>,
): Promise<void> {
  await firestoreSet(trackedPath(userId), festivalId, {
    ...data,
    userId,
    festivalId,
  } as Record<string, unknown>, { merge: true });
  trackFestivalTrackerChanged({
    festivalId,
    status: data.status,
    changedFields: Object.keys(data).sort(),
  });
}

export async function deleteTracker(userId: string, festivalId: string): Promise<void> {
  await firestoreDelete(trackedPath(userId), festivalId);
  trackFestivalTrackerRemoved(festivalId);
}
