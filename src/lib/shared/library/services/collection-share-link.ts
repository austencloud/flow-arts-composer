/**
 * Mint the short share code for a public collection you own.
 *
 * `collectionLinks/{code}` → { ownerId, collectionId, createdAt } is the
 * world-readable lookup the `/c/{code}` route resolves; the collection doc
 * carries the same code in `shareCode`. Both are written in one transaction,
 * and the rules only accept a link whose collection records that code in the
 * same commit, so a code can never point at a collection that does not claim
 * it. A collection that already has a code keeps it: handed-out links stay
 * good for the life of the collection.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { getUserCollectionPath } from "#lib/shared/library/data/firestore-paths.js";
import { getAuthenticatedUserId } from "#lib/shared/library/services/collection-firestore-mapper.js";
import {
  MAX_SHORT_CODE_LENGTH,
  MIN_SHORT_CODE_LENGTH,
  randomShortCode,
} from "#lib/shared/qr/services/short-code-manager.js";
import { COLLECTION_LINKS_COLLECTION } from "../domain/collection-share-code.js";

/** Random draws per code length before growing the code by one character. */
const ATTEMPTS_PER_LENGTH = 10;

const inFlight = new Map<string, Promise<string | null>>();

/**
 * Returns the collection's share code, minting one if it has none. Resolves
 * null when the collection is missing, private, not yours, or the write is
 * refused; callers fall back to the long link rather than toasting, since
 * sharing still works without the short form.
 */
export function claimCollectionShareCode(
  collectionId: string
): Promise<string | null> {
  const pending = inFlight.get(collectionId);
  if (pending) return pending;
  const run = claim(collectionId).finally(() => {
    inFlight.delete(collectionId);
  });
  inFlight.set(collectionId, run);
  return run;
}

async function claim(collectionId: string): Promise<string | null> {
  let userId: string;
  try {
    userId = getAuthenticatedUserId();
  } catch {
    return null;
  }

  try {
    const db = await getFirestoreInstance();
    const collectionRef = doc(db, getUserCollectionPath(userId, collectionId));
    return await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(collectionRef);
      if (!snapshot.exists()) return null;
      const data = snapshot.data();
      if (data["isPublic"] !== true) return null;
      const existing = data["shareCode"];
      if (typeof existing === "string" && existing.length > 0) return existing;

      for (
        let length = MIN_SHORT_CODE_LENGTH;
        length <= MAX_SHORT_CODE_LENGTH;
        length++
      ) {
        for (let attempt = 0; attempt < ATTEMPTS_PER_LENGTH; attempt++) {
          const code = randomShortCode(length);
          const linkRef = doc(db, COLLECTION_LINKS_COLLECTION, code);
          const taken = await tx.get(linkRef);
          if (taken.exists()) continue;
          tx.set(linkRef, {
            ownerId: userId,
            collectionId,
            createdAt: serverTimestamp(),
          });
          tx.update(collectionRef, {
            shareCode: code,
            updatedAt: serverTimestamp(),
          });
          return code;
        }
      }
      return null;
    });
  } catch (err) {
    console.warn("[collection-share-link] claim failed", err);
    return null;
  }
}
