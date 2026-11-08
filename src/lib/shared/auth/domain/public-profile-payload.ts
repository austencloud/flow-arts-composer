/**
 * The exact `users/{uid}` objects the sign-in sync writes, as pure functions so
 * the Firestore rules tests write the same payload the app does
 * (tests/integration/firestore-rules/firestore.rules.test.ts).
 *
 * Pictures: only a real provider or uploaded URL is stored. A person with no
 * photo stores null and every avatar renders a generated picture from the
 * name at display time (RobustAvatar). The generated picture is a `data:` URL,
 * which the rules refuse (`isImageUrl` takes https only), so persisting it
 * denied every email sign-up and every guest profile.
 */

import { profileVersionFor } from "../../community/domain/models/public-profile-contract";

/** The parts of a Firebase Auth user the profile payload reads. */
export interface ProfileSource {
  isAnonymous: boolean;
  photoURL: string | null;
}

/** First write of a profile. `timestamp` is serverTimestamp in the app. */
export function newPublicProfile(
  user: ProfileSource,
  displayName: string,
  timestamp: () => unknown
): Record<string, unknown> {
  return {
    // A guest is written unlisted (version 0); see profileVersionFor.
    publicProfileVersion: profileVersionFor(user.isAnonymous),
    displayName,
    photoURL: user.photoURL ?? null,
    avatar: user.photoURL ?? null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    lastActivityDate: timestamp(),
    // Cloud Functions reconcile these from the actual subcollections,
    // including guest saves that predate this full profile document.
    sequenceCount: 0,
    collectionCount: 0,
    followerCount: 0,
    // Initialize gamification fields (denormalized for leaderboards)
    totalXP: 0,
    currentLevel: 1,
    achievementCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    // Optional profile fields
    pronouns: null,
    // Admin status (default false)
    isAdmin: false,
    // Guest flag — anonymous sessions are excluded from Browse Creators
    // until they upgrade to a full account (see anonymous-upgrade.ts).
    isAnonymous: user.isAnonymous,
  };
}

/**
 * Picture fields for a later sign-in. A real Auth photo replaces what is
 * stored; with none, a generated `data:` picture stored by an older build is
 * cleared to null (the rules refuse it on any write that touches it), and a
 * stored real photo or null is left alone.
 */
export function photoChanges(
  authPhotoURL: string | null,
  stored: { photoURL?: unknown; avatar?: unknown } | undefined
): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const field of ["photoURL", "avatar"] as const) {
    const current = stored?.[field];
    if (authPhotoURL) {
      if (current !== authPhotoURL) changes[field] = authPhotoURL;
    } else if (typeof current === "string" && current.startsWith("data:")) {
      changes[field] = null;
    }
  }
  return changes;
}
