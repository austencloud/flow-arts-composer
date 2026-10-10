/**
 * followed-collections - References to other users' public collections
 *
 * A follow is a lightweight pointer doc under the follower's account:
 * users/{uid}/followedCollections/{ownerId}_{collectionId}. The pointed-at
 * collection stays canonical under its owner — following never copies data,
 * so the follower always sees the live collection (the membership model
 * collaborative collections will build on).
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import {
  getFollowedCollectionPath,
  getFollowedCollectionsPath,
} from "#lib/shared/library/data/firestore-paths.js";
import { getAuthenticatedUserId } from "#lib/shared/library/services/collection-firestore-mapper.js";
import {
  trackCollectionFollowChanged,
  type CollectionFollowSource,
} from "#lib/shared/analytics/social-events.js";

export interface FollowedCollectionRef {
  readonly ownerId: string;
  readonly collectionId: string;
}

export async function followCollection(
  ownerId: string,
  collectionId: string,
  source: CollectionFollowSource
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  await setDoc(
    doc(firestore, getFollowedCollectionPath(userId, ownerId, collectionId)),
    { ownerId, collectionId, followedAt: serverTimestamp() }
  );
  trackCollectionFollowChanged("follow", source, ownerId, collectionId);
}

export async function unfollowCollection(
  ownerId: string,
  collectionId: string,
  source: CollectionFollowSource
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  await deleteDoc(
    doc(firestore, getFollowedCollectionPath(userId, ownerId, collectionId))
  );
  trackCollectionFollowChanged("unfollow", source, ownerId, collectionId);
}

/** Live list of the signed-in user's follow refs (not the collections themselves). */
export async function subscribeToFollowedCollections(
  callback: (refs: FollowedCollectionRef[]) => void
): Promise<Unsubscribe> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId("read");
  return onSnapshot(
    collection(firestore, getFollowedCollectionsPath(userId)),
    (snapshot) => {
      const refs: FollowedCollectionRef[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (typeof data["ownerId"] === "string" && typeof data["collectionId"] === "string") {
          refs.push({ ownerId: data["ownerId"], collectionId: data["collectionId"] });
        }
      });
      callback(refs);
    }
  );
}
