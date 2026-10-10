import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { stripUndefined } from "#lib/shared/firestore/firestore-helpers.js";
import {
  getArtifactPublicationRequestPath,
  getPublicArtifactPath,
} from "../data/artifact-publication-paths";

/**
 * Moderation of published artifacts, publish-first model: there is no
 * approval gate — owners publish directly, and the only moderator action is
 * the retroactive takedown. It runs against the admin client (custom-claim
 * `isAdmin()` in firestore.rules); `removed` is terminal for that exact
 * content, so a takedown cannot be self-reversed by the owner.
 */

export interface PublicationReviewer {
  readonly uid: string;
}

/**
 * Takedown of a published artifact: delist the envelope and mark the matching
 * ledger entry removed, atomically.
 */
export async function removePublication(
  requestId: string,
  reviewer: PublicationReviewer,
  note?: string
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const requestRef = doc(
    firestore,
    getArtifactPublicationRequestPath(requestId)
  );
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error(`Publication ledger entry ${requestId} does not exist`);
  }
  const request = requestSnap.data() as {
    artifactId?: string;
    revisionId?: string;
  };
  if (!request.artifactId) {
    throw new Error(`Publication ledger entry ${requestId} lacks an artifact id`);
  }

  const envelopeRef = doc(firestore, getPublicArtifactPath(request.artifactId));
  const envelope = await getDoc(envelopeRef);
  const batch = writeBatch(firestore);
  // Delist only when THIS revision is the live one — removing a superseded
  // ledger entry must not take down a newer published revision.
  if (
    envelope.exists() &&
    (envelope.data() as { currentRevisionId?: string }).currentRevisionId ===
      request.revisionId
  ) {
    batch.delete(envelopeRef);
  }
  batch.update(
    requestRef,
    stripUndefined({
      status: "removed",
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewer.uid,
      ...(note !== undefined && { reviewNote: note }),
    })
  );
  await batch.commit();
}
