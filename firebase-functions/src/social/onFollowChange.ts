/**
 * Follow-count maintenance and new-follower notification Cloud Functions.
 *
 * Firestore rules forbid a client writing another user's `followerCount`
 * (see firestore.rules `users/{userId}` update: owner || admin). So the
 * denormalized social counters are owned by the server: a follow relationship
 * is a single doc at
 *
 *   users/{userId}/followers/{followerUserId}
 *
 * and these triggers keep BOTH counters in sync from that source of truth.
 *
 * Each event recounts the relationship collections and writes their exact
 * totals. That makes retries idempotent and repairs a stale cached total the
 * next time either person follows or unfollows someone.
 *
 * The create trigger also writes the followed user's "user-followed"
 * notification. That write has to happen server-side for the same reason the
 * counters do: firestore.rules denies a non-admin writing into another user's
 * notifications subcollection, so a client-side attempt is silently swallowed
 * (the same bug that swallowed every Pulse signup alert — see
 * pulse/notifyAdmins.ts). The Admin SDK bypasses rules, and the existing
 * onNewNotification trigger picks the doc up and delivers FCM push.
 *
 * Trigger path: users/{userId}/followers/{followerUserId}
 */

import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

const FOLLOW_PATH = "users/{userId}/followers/{followerUserId}";

export async function _reconcileFollowCounts(
  targetUserId: string,
  followerUserId: string,
  firestore: FirebaseFirestore.Firestore = admin.firestore()
): Promise<void> {
  if (targetUserId === followerUserId) {
    return;
  }

  const targetProfile = firestore.doc(`users/${targetUserId}`);
  const followerProfile = firestore.doc(`users/${followerUserId}`);
  const followerCount = firestore
    .collection(`users/${targetUserId}/followers`)
    .count();
  const followingCount = firestore
    .collection(`users/${followerUserId}/following`)
    .count();

  await firestore.runTransaction(async (transaction) => {
    const [target, follower, followers, following] = await Promise.all([
      transaction.get(targetProfile),
      transaction.get(followerProfile),
      transaction.get(followerCount),
      transaction.get(followingCount),
    ]);

    // Account deletion can race a delayed event. Updates preserve that deletion
    // instead of recreating a profile just to store a counter.
    if (target.exists) {
      transaction.update(targetProfile, {
        followerCount: followers.data().count,
      });
    }
    if (follower.exists) {
      transaction.update(followerProfile, {
        followingCount: following.data().count,
      });
    }
  });
}

/**
 * Write the followed user's inbox notification. onNewNotification turns this
 * into a push (respecting the user's `userFollowed` preference) — this
 * function must NOT check it itself, or the inbox entry would go missing for
 * someone who only muted push.
 *
 * The doc id is deterministic (`follow-<followerUserId>`) rather than random,
 * so an unfollow/refollow cycle overwrites one entry instead of stacking a new
 * alert every time. Overwriting an existing doc is an update, not a create, so
 * it also can't re-fire the push trigger — a follow toggled repeatedly buzzes
 * the target's phone exactly once.
 */
async function notifyOfNewFollower(
  targetUserId: string,
  followerUserId: string
): Promise<void> {
  const db = admin.firestore();
  const followerSnap = await db.collection("users").doc(followerUserId).get();
  const followerData = followerSnap.data();
  const followerName =
    (followerData?.displayName as string | undefined) ||
    (followerData?.name as string | undefined) ||
    "Someone";

  await db
    .collection("users")
    .doc(targetUserId)
    .collection("notifications")
    .doc(`follow-${followerUserId}`)
    .set({
      userId: targetUserId,
      type: "user-followed",
      message: `${followerName} started following you`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      fromUserId: followerUserId,
      fromUserName: followerName,
    });
}

export const onFollowCreated = onDocumentCreated(
  { document: FOLLOW_PATH, retry: true },
  async (event) => {
    const { userId, followerUserId } = event.params;
    await _reconcileFollowCounts(userId, followerUserId);

    if (userId === followerUserId) {
      return;
    }

    // The relationship is already complete even if its optional notification
    // cannot be delivered. The deterministic notification id prevents repeats.
    try {
      await notifyOfNewFollower(userId, followerUserId);
    } catch (error) {
      console.error(
        `onFollowCreated: failed to notify ${userId} of follower ${followerUserId}`,
        error
      );
    }
  }
);

export const onFollowDeleted = onDocumentDeleted(
  { document: FOLLOW_PATH, retry: true },
  async (event) => {
    const { userId, followerUserId } = event.params;
    await _reconcileFollowCounts(userId, followerUserId);
  }
);
